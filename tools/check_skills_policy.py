#!/usr/bin/env python3
"""
Policy-as-code guardrail for single-repo skills governance.

This check enforces that instruction entrypoints keep the same default skills
source and explicitly avoid defaulting to the mega-pack baseline.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent

CANONICAL_SKILLS_REPO = "https://github.com/RGConsulting12/agent-skills"
DISALLOWED_DEFAULT_REPO_TOKEN = "everything-claude-code"

POLICY_FILE = REPO_ROOT / "docs/policies/single-repo-skills-policy.md"
TARGET_FILES = [
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "CLAUDE.md",
    REPO_ROOT / "GEMINI.md",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def validate_target(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"Missing required instruction file: {path.relative_to(REPO_ROOT)}"]

    text = read_text(path)
    lowered = text.lower()

    if CANONICAL_SKILLS_REPO not in text:
        errors.append(
            f"{path.relative_to(REPO_ROOT)}: missing canonical skills repo URL "
            f"({CANONICAL_SKILLS_REPO})."
        )

    # Require an explicit prohibition statement to prevent silent policy erosion.
    if (
        DISALLOWED_DEFAULT_REPO_TOKEN not in lowered
        or "do not use" not in lowered
    ):
        errors.append(
            f"{path.relative_to(REPO_ROOT)}: missing explicit prohibition for "
            f"defaulting to {DISALLOWED_DEFAULT_REPO_TOKEN}."
        )

    # Detect potentially conflicting skills baselines.
    url_pattern = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)")
    urls = {f"https://github.com/{owner}/{repo}" for owner, repo in url_pattern.findall(text)}
    non_canonical_skill_urls = sorted(
        url
        for url in urls
        if "skills" in url.lower() and url != CANONICAL_SKILLS_REPO
    )
    if non_canonical_skill_urls:
        errors.append(
            f"{path.relative_to(REPO_ROOT)}: contains non-canonical skills repo URL(s): "
            + ", ".join(non_canonical_skill_urls)
        )

    return errors


def main() -> int:
    failures: list[str] = []

    if not POLICY_FILE.exists():
        failures.append(
            "Missing policy document: docs/policies/single-repo-skills-policy.md"
        )

    for target in TARGET_FILES:
        failures.extend(validate_target(target))

    if failures:
        print("Skills policy check failed:\n")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Skills policy check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
