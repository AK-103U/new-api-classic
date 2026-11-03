"""Prepare an upstream merge and report its preflight result in this repository."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


CONFLICT_TITLE = "⚠️ 上游更新合并存在冲突"


def git(*args, check=True):
    return subprocess.run(
        ["git", *args], text=True, capture_output=True, check=check
    )


def gh(*args):
    # Never let an upstream remote or a gh default select the notification repo.
    result = subprocess.run(
        ["gh", *args, "--repo", os.environ["GITHUB_REPOSITORY"]],
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


def prepare(directory):
    state = {"status": "error", "has_changes": False}
    try:
        git("config", "user.name", "github-actions[bot]")
        git("config", "user.email", "github-actions[bot]@users.noreply.github.com")
        # A manual dispatch may use a topic branch's workflow, but main is always
        # the synchronization base. Never import that topic branch into the PR.
        git("fetch", "--no-tags", "origin", "main")
        remotes = git("remote").stdout.splitlines()
        command = "set-url" if "upstream" in remotes else "add"
        git("remote", command, "upstream", "https://github.com/QuantumNous/new-api.git")
        git("fetch", "--no-tags", "upstream", "main")
        state["base_rev"] = git("rev-parse", "origin/main").stdout.strip()
        state["upstream_rev"] = git("rev-parse", "upstream/main").stdout.strip()
        ancestor = git("merge-base", state["base_rev"], state["upstream_rev"]).stdout.strip()
        if ancestor == state["upstream_rev"]:
            state["status"] = "up_to_date"
            return

        state["has_changes"] = True
        revision_range = f"{ancestor}..{state['upstream_rev']}"
        state["commits"] = git("log", "--oneline", "--no-merges", "-n", "35", revision_range).stdout
        state["stats"] = git("diff", "--shortstat", revision_range).stdout.strip()
        remote_branch = git("ls-remote", "--refs", "origin", "refs/heads/upstream-sync").stdout.split()
        state["previous_rev"] = remote_branch[0] if remote_branch else ""
        git("checkout", "-B", "upstream-sync", state["base_rev"])
        result = git(
            "merge", "--no-ff", state["upstream_rev"],
            "-m", f"chore(sync): sync upstream {state['upstream_rev'][:12]}",
            check=False,
        )
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        (directory / "merge.log").write_text(result.stdout + result.stderr, encoding="utf-8")
        if result.returncode == 0:
            state["status"] = "merged"
            state["merged_rev"] = git("rev-parse", "HEAD").stdout.strip()
            return

        state["conflicts"] = git("diff", "--name-only", "--diff-filter=U").stdout.splitlines()
        # Save the conflict list before aborting, which clears the index stages.
        (directory / "conflicts.txt").write_text("\n".join(state["conflicts"]), encoding="utf-8")
        if git("rev-parse", "--verify", "-q", "MERGE_HEAD", check=False).returncode == 0:
            git("merge", "--abort")
        if state["conflicts"]:
            state["status"] = "conflict"
            return
        raise RuntimeError("Merge failed without conflicted files; see the merge log")
    finally:
        (directory / "state.json").write_text(json.dumps(state), encoding="utf-8")
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"merge_status={state['status']}\n")
            output.write(f"previous_rev={state.get('previous_rev', '')}\n")
            output.write(f"merged_rev={state.get('merged_rev', '')}\n")


def build_backend():
    # Only for compilation checks; image publishing builds the real frontend.
    Path("web/dist").mkdir(parents=True, exist_ok=True)
    Path("web/dist/index.html").touch()
    failed = False
    for module in (".", "relaykit", "tokenkit"):
        print(f"::group::Build {module}", flush=True)
        result = subprocess.run(
            ["go", "build", "./..."], cwd=module,
            env={**os.environ, "GOWORK": "off"},
        )
        failed |= result.returncode != 0
        print("::endgroup::", flush=True)
    return int(failed)


def report(directory):
    state = json.loads((directory / "state.json").read_text(encoding="utf-8"))
    repo = os.environ["GITHUB_REPOSITORY"]
    run_url = f"{os.environ['GITHUB_SERVER_URL']}/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    body = f"## 上游同步报告\n\n[查看运行日志]({run_url})\n\n"
    status = state["status"]
    checks = {
        "Go 环境": os.environ.get("GO_SETUP_OUTCOME", "skipped"),
        "Bun 环境": os.environ.get("BUN_SETUP_OUTCOME", "skipped"),
        "后端编译": os.environ.get("BACKEND_OUTCOME", "skipped"),
        "前端安装与类型检查": os.environ.get("FRONTEND_OUTCOME", "skipped"),
        "同步分支推送": os.environ.get("PUSH_OUTCOME", "skipped"),
    }
    passed = status == "merged" and all(value == "success" for value in checks.values())
    if status == "up_to_date":
        body += "上游已同步，无需创建 PR。\n"
    elif status == "conflict":
        body += "❌ 合并冲突，未执行构建预检。请手动解决以下文件：\n\n"
        body += "".join(f"- `{name}`\n" for name in state["conflicts"])
    elif status == "merged":
        body += "✅ 编译与类型预检通过。\n" if passed else "❌ 同步预检或分支推送未通过。\n"
        body += "\n" + "".join(f"- {name}: `{value}`\n" for name, value in checks.items())
        body += "\n本预检不代表完整 CI。机器人创建的 PR 若显示工作流待批准，请在 PR 页面批准后运行完整 CI。\n"
    else:
        body += "❌ 同步准备或 Git 操作失败，并非已确认的合并冲突。请查看运行日志。\n"

    if state.get("has_changes"):
        body += f"\n基础提交：`{state['base_rev']}`\n\n上游提交：`{state['upstream_rev']}`\n"
        body += f"\n改动概览：`{state.get('stats', '')}`\n\n### 上游提交清单\n\n"
        # Commit subjects are data, not Markdown delimiters or shell source.
        body += "".join(f"    {line}\n" for line in state.get("commits", "").splitlines())
    body_file = directory / "report.md"
    body_file.write_text(body, encoding="utf-8")
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(body)

    try:
        if status == "conflict":
            issue = gh(
                "issue", "list", "--state", "open", "--author", "github-actions[bot]",
                "--search", f'"{CONFLICT_TITLE}" in:title', "--json", "number,title",
                "--jq", f'map(select(.title | startswith("{CONFLICT_TITLE}"))) | .[0].number // empty',
            )
            if issue:
                gh("issue", "edit", issue, "--title", CONFLICT_TITLE, "--body-file", str(body_file))
            else:
                gh("issue", "create", "--title", CONFLICT_TITLE, "--body-file", str(body_file))
        elif status == "merged" and checks["同步分支推送"] == "success":
            title = "chore(sync): 同步上游更新" if passed else "⚠️ [预检未通过] 同步上游更新"
            pr = gh(
                "pr", "list", "--head", "upstream-sync", "--base", "main",
                "--state", "open", "--json", "number", "--jq", ".[0].number // empty",
            )
            if pr:
                gh("pr", "edit", pr, "--title", title, "--body-file", str(body_file))
            else:
                gh("pr", "create", "--title", title, "--body-file", str(body_file), "--base", "main", "--head", "upstream-sync")
    except subprocess.CalledProcessError:
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write("\n❌ GitHub 通知失败；以上同步与预检结果不变。请检查仓库设置和运行日志。\n")
        raise
    return 0 if status == "up_to_date" or passed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "build-backend", "report"])
    args = parser.parse_args()
    directory = Path(os.environ["RUNNER_TEMP"]) / "upstream-sync"
    directory.mkdir(parents=True, exist_ok=True)
    try:
        if args.operation == "prepare":
            prepare(directory)
        elif args.operation == "build-backend":
            sys.exit(build_backend())
        else:
            sys.exit(report(directory))
    except (subprocess.CalledProcessError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, end="", file=sys.stderr)
        sys.exit(1)
