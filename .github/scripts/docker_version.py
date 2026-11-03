"""Resolve a Docker/app version from the release tag or merged upstream versions.

Upstream tags live in an isolated local namespace, never in refs/tags and never
pushed to the fork. VERSION is a build output, not the source of this metadata.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import re
import subprocess
import sys


UPSTREAM_TAGS = "refs/new-api-upstream-tags"


def git(*args):
    return subprocess.run(
        ["git", *args], text=True, capture_output=True, check=True
    ).stdout.strip()


def release_version_key(tag):
    # Compare canonical project releases, not channel/hotfix tags such as
    # v1.0.0-rc.19-i18nfix.2 (which SemVer ranks above numeric rc.47).
    match = re.fullmatch(
        r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
        r"(?:-(alpha|beta|rc|patch)\.(0|[1-9][0-9]*))?",
        tag,
    )
    if not match:
        return None
    major, minor, patch, stage, number = match.groups()
    stages = {"alpha": 0, "beta": 1, "rc": 2, None: 3, "patch": 4}
    return (int(major), int(minor), int(patch), stages[stage], int(number or 0))


def resolve_metadata():
    revision = git("rev-parse", "HEAD")
    if revision != os.environ["GITHUB_SHA"]:
        raise ValueError("The checkout does not match the workflow commit")
    short = revision[:12]
    ref = os.environ["GITHUB_REF"]
    is_tag = ref.startswith("refs/tags/v")
    upstream_version = ""
    upstream_revision = ""
    if is_tag:
        # An explicit fork release takes precedence over stale VERSION content.
        app_version = ref.removeprefix("refs/tags/")
    elif ref.startswith("refs/heads/"):
        if git("rev-parse", "--is-shallow-repository") == "true":
            raise ValueError("Version ancestry requires checkout fetch-depth: 0")
        # Fetch failure is fatal: never silently label new code with a stale tag.
        # Pruning is limited to our private refs; fork tags remain untouched.
        git(
            "fetch", "--no-tags", "--prune", "--no-write-fetch-head",
            "https://github.com/QuantumNous/new-api.git",
            f"+refs/tags/v*:{UPSTREAM_TAGS}/v*",
        )
        tags = git(
            "for-each-ref", "--merged=HEAD", "--format=%(refname:strip=2)",
            f"{UPSTREAM_TAGS}/",
        ).splitlines()
        versions = [(release_version_key(tag), tag) for tag in tags]
        versions = [(key, tag) for key, tag in versions if key is not None]
        if not versions:
            raise ValueError("No merged upstream release tag found; refusing to guess a version")
        _, upstream_version = max(versions)
        upstream_revision = git("rev-parse", f"{UPSTREAM_TAGS}/{upstream_version}^{{commit}}")
        app_version = f"{upstream_version}-classic-{short}"
    else:
        raise ValueError("Docker publishing requires a branch or a v* release tag")

    # Validate before writing outputs or starting either architecture build.
    # Include architecture suffixes in the Docker tag length check.
    for tag in (app_version, f"{app_version}-amd64", f"{app_version}-arm64"):
        if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", tag):
            raise ValueError("The resolved version is not a valid Docker image tag")
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    return {
        "app_version": app_version,
        "revision": revision,
        "upstream_version": upstream_version,
        "upstream_revision": upstream_revision,
        "short_sha": f"sha-{short}",
        "date_sha": f"main-{date}-{short}",
        "is_main": str(ref == "refs/heads/main").lower(),
        "is_tag": str(is_tag).lower(),
        "image_name": os.environ["GITHUB_REPOSITORY"].lower(),
    }


if __name__ == "__main__":
    try:
        metadata = resolve_metadata()
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.writelines(f"{name}={value}\n" for name, value in metadata.items())
        print(f"Resolved version: {metadata['app_version']}")
        if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
            body = (
                "## Docker version metadata\n\n"
                f"- App / image version: `{metadata['app_version']}`\n"
                f"- Source commit: `{metadata['revision']}`\n"
            )
            if metadata["upstream_version"]:
                body += (
                    f"- Merged upstream version: `{metadata['upstream_version']}`\n"
                    f"- Upstream release commit: `{metadata['upstream_revision']}`\n"
                )
            else:
                body += "- Version source: explicit fork release tag\n"
            with Path(summary).open("a", encoding="utf-8") as output:
                output.write(body)
    except (subprocess.CalledProcessError, ValueError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, end="", file=sys.stderr)
        sys.exit(1)
