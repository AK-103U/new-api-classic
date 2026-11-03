"""Run with: python3 -B -m unittest discover -s .github/tests -v.

Uses real temporary Git repositories and a recording gh stub; no GitHub writes.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


CONTROLLER = Path(__file__).resolve().parents[1] / "scripts" / "upstream_sync.py"
VERSION_RESOLVER = CONTROLLER.with_name("docker_version.py")


class UpstreamSyncTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.origin = self.root / "origin.git"
        self.upstream = self.root / "upstream.git"
        self.seed = self.root / "seed"
        self.runner = self.root / "runner"
        self.temp = self.root / "temp"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.env = {
            **os.environ,
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_SYSTEM": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_ALLOW_PROTOCOL": "file",
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_AUTHOR_NAME": "Fixture",
            "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
            "GIT_COMMITTER_NAME": "Fixture",
            "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
            "RUNNER_TEMP": str(self.temp),
            "GITHUB_OUTPUT": str(self.root / "outputs"),
            "GITHUB_STEP_SUMMARY": str(self.root / "summary"),
            "GITHUB_REPOSITORY": "fixture-owner/custom-gateway",
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_RUN_ID": "123",
            # Explicit --repo must win even with a misleading CLI default.
            "GH_REPO": "QuantumNous/new-api",
            "GH_CALLS": str(self.root / "gh-calls.jsonl"),
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "GO_SETUP_OUTCOME": "success",
            "BUN_SETUP_OUTCOME": "success",
            "BACKEND_OUTCOME": "success",
            "FRONTEND_OUTCOME": "success",
            "PUSH_OUTCOME": "success",
        }
        for name in ("GH_FAIL", "EXISTING_ISSUE", "EXISTING_PR"):
            self.env.pop(name, None)
        self.run_command("git", "init", "--bare", "-b", "main", str(self.origin))
        self.run_command("git", "init", "-b", "main", str(self.seed))
        self.commit(self.seed, "shared.txt", "base\n", "base")
        self.run_command("git", "clone", "--bare", str(self.seed), str(self.upstream))
        self.run_command("git", "remote", "add", "origin", str(self.origin), cwd=self.seed)
        self.run_command("git", "remote", "add", "upstream", str(self.upstream), cwd=self.seed)
        self.run_command("git", "push", "origin", "main", cwd=self.seed)
        self.run_command("git", "clone", str(self.origin), str(self.runner))
        self.run_command(
            "git", "config", f"url.{self.upstream.as_uri()}.insteadOf",
            "https://github.com/QuantumNous/new-api.git", cwd=self.runner,
        )
        stub = self.bin / "gh"
        stub.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "args = sys.argv[1:]\n"
            "with open(os.environ['GH_CALLS'], 'a') as log:\n"
            "    log.write(json.dumps(args) + '\\n')\n"
            "operation = ' '.join(args[:2])\n"
            "if operation == os.environ.get('GH_FAIL'):\n"
            "    sys.stderr.write('simulated notification failure\\n')\n"
            "    sys.exit(1)\n"
            "if operation == 'pr list': print(os.environ.get('EXISTING_PR', ''))\n"
            "if operation == 'issue list': print(os.environ.get('EXISTING_ISSUE', ''))\n",
            encoding="utf-8",
        )
        stub.chmod(0o755)

    def run_command(self, *args, cwd=None, check=True, **environment):
        return subprocess.run(
            args, cwd=cwd or self.root, env={**self.env, **environment},
            text=True, capture_output=True, check=check,
        )

    def commit(self, directory, name, content, message):
        (directory / name).write_text(content, encoding="utf-8")
        self.run_command("git", "add", name, cwd=directory)
        self.run_command("git", "commit", "-m", message, cwd=directory)

    def add_upstream_change(self, name="upstream.txt", content="upstream\n"):
        self.commit(self.seed, name, content, "upstream change")
        self.run_command("git", "push", "upstream", "main", cwd=self.seed)

    def controller(self, operation, **environment):
        return self.run_command(
            sys.executable, str(CONTROLLER), operation,
            cwd=self.runner, check=False, **environment,
        )

    def state(self):
        return json.loads((self.temp / "upstream-sync" / "state.json").read_text())

    def calls(self):
        path = Path(self.env["GH_CALLS"])
        calls = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        for args in calls:
            self.assertEqual(args[args.index("--repo") + 1], self.env["GITHUB_REPOSITORY"])
        return calls

    def summary(self):
        return Path(self.env["GITHUB_STEP_SUMMARY"]).read_text(encoding="utf-8")

    def test_no_changes_uses_remote_main_not_the_dispatch_branch(self):
        self.run_command("git", "checkout", "-b", "workflow-fix", cwd=self.runner)
        self.commit(self.runner, "topic.txt", "not part of main\n", "workflow topic")
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.state()["status"], "up_to_date")
        self.assertEqual(self.controller("report").returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertIn("无需创建 PR", self.summary())

    def test_success_preserves_fork_changes_and_creates_only_a_local_sync_pr(self):
        self.commit(self.runner, "custom.txt", "classic\n", "custom change")
        self.run_command("git", "push", "origin", "main", cwd=self.runner)
        self.add_upstream_change()
        self.assertEqual(self.controller("prepare").returncode, 0)
        state = self.state()
        self.assertEqual(state["status"], "merged")
        self.assertEqual((self.runner / "custom.txt").read_text(), "classic\n")
        self.assertTrue((self.runner / "upstream.txt").exists())
        parents = self.run_command("git", "show", "-s", "--format=%P", "HEAD", cwd=self.runner).stdout.split()
        self.assertEqual(parents, [state["base_rev"], state["upstream_rev"]])
        self.assertEqual(self.controller("report").returncode, 0)
        calls = self.calls()
        self.assertEqual([args[:2] for args in calls], [["pr", "list"], ["pr", "create"]])
        self.assertIn("upstream-sync", calls[1])
        self.assertIn("编译与类型预检通过", self.summary())

    def test_existing_pr_is_updated_instead_of_duplicated(self):
        self.add_upstream_change()
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.controller("report", EXISTING_PR="17").returncode, 0)
        self.assertEqual([args[:3] for args in self.calls()][-1], ["pr", "edit", "17"])

    def test_conflicts_survive_abort_and_reuse_the_conflict_issue(self):
        self.commit(self.runner, "shared.txt", "fork\n", "fork conflict")
        self.run_command("git", "push", "origin", "main", cwd=self.runner)
        self.add_upstream_change("shared.txt", "upstream\n")
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.state()["status"], "conflict")
        self.assertEqual(self.state()["conflicts"], ["shared.txt"])
        self.assertEqual(self.run_command("git", "ls-files", "-u", cwd=self.runner).stdout, "")
        self.assertFalse((self.runner / ".git" / "MERGE_HEAD").exists())
        self.assertEqual((self.runner / "shared.txt").read_text(), "fork\n")
        self.assertEqual(self.controller("report").returncode, 1)
        self.assertEqual(self.calls()[-1][:2], ["issue", "create"])
        self.assertEqual(self.controller("report", EXISTING_ISSUE="18").returncode, 1)
        self.assertEqual(self.calls()[-1][:3], ["issue", "edit", "18"])
        self.assertIn("shared.txt", self.summary())
        self.assertIn("未执行构建预检", self.summary())

    def test_git_failure_without_conflicts_is_not_reported_as_a_conflict(self):
        self.add_upstream_change()
        hook = self.runner / ".git" / "hooks" / "pre-merge-commit"
        hook.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        hook.chmod(0o755)
        self.assertNotEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.state()["status"], "error")
        self.assertEqual(self.controller("report").returncode, 1)
        self.assertEqual(self.calls(), [])
        self.assertIn("并非已确认的合并冲突", self.summary())
        self.assertFalse((self.runner / ".git" / "MERGE_HEAD").exists())

    def test_failed_or_skipped_preflight_keeps_a_diagnostic_pr_and_fails_the_run(self):
        self.add_upstream_change()
        self.assertEqual(self.controller("prepare").returncode, 0)
        for outcomes in [
            {"BACKEND_OUTCOME": "failure"},
            {"FRONTEND_OUTCOME": "failure"},
            {"GO_SETUP_OUTCOME": "failure", "BACKEND_OUTCOME": "skipped"},
            {"BUN_SETUP_OUTCOME": "failure", "FRONTEND_OUTCOME": "skipped"},
        ]:
            with self.subTest(outcomes=outcomes):
                self.assertEqual(self.controller("report", **outcomes).returncode, 1)
                args = self.calls()[-1]
                self.assertEqual(args[:2], ["pr", "create"])
                self.assertIn("预检未通过", args[args.index("--title") + 1])
                body = (self.temp / "upstream-sync" / "report.md").read_text()
                self.assertNotIn("✅ 编译与类型预检通过", body)

    def test_push_failure_does_not_relabel_an_old_pr_with_a_new_revision(self):
        self.add_upstream_change()
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.controller("report", PUSH_OUTCOME="failure", EXISTING_PR="17").returncode, 1)
        self.assertEqual(self.calls(), [])
        self.assertIn("同步分支推送: `failure`", self.summary())

    def test_notification_failure_keeps_summary_and_does_not_create_after_lookup_failure(self):
        self.add_upstream_change()
        self.assertEqual(self.controller("prepare").returncode, 0)
        for operation in ["pr list", "pr create"]:
            with self.subTest(operation=operation):
                self.assertEqual(self.controller("report", GH_FAIL=operation).returncode, 1)
                self.assertEqual(" ".join(self.calls()[-1][:2]), operation)
                self.assertIn("GitHub 通知失败", self.summary())
                self.assertIn(self.state()["upstream_rev"], self.summary())

    def test_backend_prepares_embed_and_checks_all_modules_without_a_workspace(self):
        for module in ("relaykit", "tokenkit"):
            (self.runner / module).mkdir()
        stub = self.bin / "go"
        stub.write_text(
            f"#!{sys.executable}\n"
            "import json, os, pathlib, sys\n"
            "root = pathlib.Path(os.environ['CHECKOUT'])\n"
            "assert (root / 'web/dist/index.html').is_file()\n"
            "assert os.environ['GOWORK'] == 'off'\n"
            "module = str(pathlib.Path.cwd().relative_to(root))\n"
            "with open(os.environ['BUILD_CALLS'], 'a') as log:\n"
            "    log.write(json.dumps([module, sys.argv[1:]]) + '\\n')\n"
            "sys.exit(1 if module == os.environ.get('FAIL_MODULE') else 0)\n",
            encoding="utf-8",
        )
        stub.chmod(0o755)
        calls = self.root / "build-calls.jsonl"
        for failed_module, exit_code in [("", 0), ("relaykit", 1)]:
            with self.subTest(failed_module=failed_module):
                calls.unlink(missing_ok=True)
                result = self.controller(
                    "build-backend", CHECKOUT=str(self.runner),
                    BUILD_CALLS=str(calls), FAIL_MODULE=failed_module,
                    GOWORK="a-workspace-that-must-not-be-used",
                )
                self.assertEqual(result.returncode, exit_code, result.stderr)
                self.assertEqual(
                    [json.loads(line) for line in calls.read_text().splitlines()],
                    [[module, ["build", "./..."]] for module in (".", "relaykit", "tokenkit")],
                )

    def test_conflict_notification_failure_preserves_the_conflict_diagnosis(self):
        self.commit(self.runner, "shared.txt", "fork\n", "fork conflict")
        self.run_command("git", "push", "origin", "main", cwd=self.runner)
        self.add_upstream_change("shared.txt", "upstream\n")
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(self.controller("report", GH_FAIL="issue create").returncode, 1)
        self.assertIn("合并冲突", self.summary())
        self.assertIn("shared.txt", self.summary())
        self.assertIn("GitHub 通知失败", self.summary())
        self.assertEqual(self.calls()[-1][:2], ["issue", "create"])

    def test_commit_report_is_bounded_without_a_pipe_to_head(self):
        for index in range(36):
            self.commit(self.seed, "upstream.txt", f"change {index}\n", f"update {index}")
        self.run_command("git", "push", "upstream", "main", cwd=self.seed)
        self.assertEqual(self.controller("prepare").returncode, 0)
        self.assertEqual(len(self.state()["commits"].splitlines()), 35)

    def resolve_image_version(self, ref="refs/heads/main", **environment):
        Path(self.env["GITHUB_OUTPUT"]).unlink(missing_ok=True)
        revision = self.run_command("git", "rev-parse", "HEAD", cwd=self.runner).stdout.strip()
        return self.run_command(
            sys.executable, str(VERSION_RESOLVER), cwd=self.runner, check=False,
            **{"GITHUB_REF": ref, "GITHUB_SHA": revision, **environment},
        )

    def image_metadata(self):
        return dict(
            line.split("=", 1)
            for line in Path(self.env["GITHUB_OUTPUT"]).read_text().splitlines()
        )

    def publish_upstream_tag(self, tag, annotated=False):
        args = ["git", "tag", tag]
        if annotated:
            args += ["-a", "-m", tag]
        self.run_command(*args, cwd=self.seed)
        self.run_command("git", "push", "upstream", f"refs/tags/{tag}", cwd=self.seed)

    def test_docker_version_uses_upstream_tags_without_replacing_local_tags(self):
        self.publish_upstream_tag("v1.0.0-rc.47", annotated=True)
        upstream_revision = self.run_command("git", "rev-parse", "HEAD", cwd=self.seed).stdout.strip()
        self.commit(self.runner, "VERSION", "v1.0.0-rc.45-custom\n", "stale version")
        revision = self.run_command("git", "rev-parse", "HEAD", cwd=self.runner).stdout.strip()
        # Neither the stale fork tag nor an identically named local tag may win.
        for tag in ("v1.0.0-rc.45", "v1.0.0-rc.47", "v99.0.0"):
            self.run_command("git", "tag", tag, cwd=self.runner)
        before = self.run_command("git", "show-ref", "--tags", cwd=self.runner).stdout
        result = self.resolve_image_version(GITHUB_REPOSITORY="Fixture-Owner/Custom-Gateway")
        self.assertEqual(result.returncode, 0, result.stderr)
        metadata = self.image_metadata()
        self.assertEqual(metadata["app_version"], f"v1.0.0-rc.47-classic-{revision[:12]}")
        self.assertEqual(metadata["upstream_version"], "v1.0.0-rc.47")
        self.assertEqual(metadata["upstream_revision"], upstream_revision)
        self.assertEqual(metadata["revision"], revision)
        self.assertEqual(metadata["short_sha"], f"sha-{revision[:12]}")
        self.assertEqual(metadata["image_name"], "fixture-owner/custom-gateway")
        self.assertEqual((metadata["is_main"], metadata["is_tag"]), ("true", "false"))
        self.assertEqual(self.run_command("git", "show-ref", "--tags", cwd=self.runner).stdout, before)
        self.assertEqual((self.runner / "VERSION").read_text(), "v1.0.0-rc.45-custom\n")
        self.assertIn(metadata["app_version"], self.summary())
        self.assertEqual(self.calls(), [])

    def test_docker_version_ignores_unmerged_releases_and_submodule_tags(self):
        self.publish_upstream_tag("v1.0.0-rc.47")
        self.publish_upstream_tag("relaykit/v99.0.0")
        self.publish_upstream_tag("tokenkit/v99.0.0")
        self.publish_upstream_tag("v1.0.0-rc.19-i18nfix.2")
        self.publish_upstream_tag("v99.0.0-preview.1")
        revision = self.run_command("git", "rev-parse", "HEAD", cwd=self.runner).stdout.strip()
        self.add_upstream_change()
        self.publish_upstream_tag("v2.0.0")
        result = self.resolve_image_version()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.image_metadata()["app_version"], f"v1.0.0-rc.47-classic-{revision[:12]}")
        self.assertEqual(self.run_command("git", "rev-parse", "HEAD", cwd=self.runner).stdout.strip(), revision)
        self.assertFalse((self.runner / "upstream.txt").exists())
        self.assertEqual(self.run_command("git", "tag", "--list", cwd=self.runner).stdout, "")

    def test_docker_version_orders_numeric_prereleases_and_final_releases(self):
        for new_tags, expected in [
            (["v1.0.0-rc.9", "v1.0.0-rc.10", "v1.0.0-alpha.99", "v1.0.0-rc.099"], "v1.0.0-rc.10"),
            (["v1.0.0"], "v1.0.0"),
            (["v1.0.9", "v1.0.10", "v1.0.10-rc.1"], "v1.0.10"),
            (["v1.0.10-patch.1"], "v1.0.10-patch.1"),
        ]:
            with self.subTest(expected=expected):
                for tag in new_tags:
                    self.publish_upstream_tag(tag)
                result = self.resolve_image_version()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.image_metadata()["upstream_version"], expected)

    def test_docker_tag_release_overrides_version_file_without_fetching_upstream(self):
        self.commit(self.runner, "VERSION", "v0.0.1-stale\n", "stale version")
        self.run_command("git", "tag", "v1.0.0-classic.2", cwd=self.runner)
        self.upstream.rename(self.root / "offline-upstream.git")
        result = self.resolve_image_version("refs/tags/v1.0.0-classic.2")
        self.assertEqual(result.returncode, 0, result.stderr)
        metadata = self.image_metadata()
        self.assertEqual(metadata["app_version"], "v1.0.0-classic.2")
        self.assertEqual(metadata["upstream_version"], "")
        self.assertEqual((metadata["is_main"], metadata["is_tag"]), ("false", "true"))

    def test_docker_invalid_release_tags_fail_before_build_metadata_is_written(self):
        for tag in ("v1.0.0+metadata", "v" + "1" * 125):
            with self.subTest(tag=tag):
                result = self.resolve_image_version(f"refs/tags/{tag}")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("not a valid Docker image tag", result.stderr)
                self.assertFalse(Path(self.env["GITHUB_OUTPUT"]).exists())

    def test_docker_version_never_falls_back_to_old_local_or_cached_tags(self):
        self.run_command("git", "tag", "v1.0.0", cwd=self.runner)
        result = self.resolve_image_version()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No merged upstream release tag", result.stderr)
        self.assertFalse(Path(self.env["GITHUB_OUTPUT"]).exists())
        self.publish_upstream_tag("v1.0.0")
        self.assertEqual(self.resolve_image_version().returncode, 0)
        self.upstream.rename(self.root / "offline-upstream.git")
        result = self.resolve_image_version()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(Path(self.env["GITHUB_OUTPUT"]).exists())

    def test_docker_version_prunes_deleted_upstream_tags_but_keeps_fork_tags(self):
        for tag in ("v1.0.0", "v1.1.0"):
            self.publish_upstream_tag(tag)
        self.assertEqual(self.resolve_image_version().returncode, 0)
        self.assertEqual(self.image_metadata()["upstream_version"], "v1.1.0")
        self.run_command("git", "push", "upstream", ":refs/tags/v1.1.0", cwd=self.seed)
        self.run_command("git", "tag", "v1.1.0", cwd=self.runner)
        self.assertEqual(self.resolve_image_version().returncode, 0)
        self.assertEqual(self.image_metadata()["upstream_version"], "v1.0.0")
        self.assertEqual(self.run_command("git", "tag", "--list", cwd=self.runner).stdout.strip(), "v1.1.0")

    def test_docker_version_rejects_wrong_or_shallow_checkouts(self):
        result = self.resolve_image_version(GITHUB_SHA="0" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match the workflow commit", result.stderr)
        shallow = self.root / "shallow"
        self.run_command("git", "clone", "--depth=1", self.origin.as_uri(), str(shallow))
        self.runner = shallow
        result = self.resolve_image_version()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("fetch-depth: 0", result.stderr)
        self.assertFalse(Path(self.env["GITHUB_OUTPUT"]).exists())

    def test_docker_manual_branch_build_is_marked_as_non_release(self):
        self.publish_upstream_tag("v1.0.0")
        self.run_command("git", "checkout", "-b", "version-preview", cwd=self.runner)
        result = self.resolve_image_version("refs/heads/version-preview")
        self.assertEqual(result.returncode, 0, result.stderr)
        metadata = self.image_metadata()
        self.assertEqual((metadata["is_main"], metadata["is_tag"]), ("false", "false"))
        self.assertTrue(metadata["app_version"].startswith("v1.0.0-classic-"))


if __name__ == "__main__":
    unittest.main()
