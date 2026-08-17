#!/usr/bin/env python3
"""
Manual AI usage logger for team members using any AI tool.

Examples:
  python scripts/log_manual.py
  python scripts/log_manual.py --tool claude --prompt "Cập nhật FE"
  python scripts/log_manual.py --tool chatgpt --prompt "Giải thích API" --model "gpt-5.6"

Logs are saved to .ai-log/session.jsonl.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


def git(cmd):
    """Run a git command and return its output."""
    try:
        return subprocess.check_output(
            cmd.split(),
            shell=False,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""
    except BaseException:
        return ""


def get_student():
    """Get student identity from git config."""
    email = git("git config user.email")
    name = git("git config user.name")

    if not email:
        print(
            '[log] git email not set! Using fallback: unknown',
            file=sys.stderr,
        )
        print(
            '[log] Run: git config user.email "your@vinuni.edu.vn"',
            file=sys.stderr,
        )

    if name and email:
        return f"{name} <{email}>"

    return email or name or "unknown"


def get_repo():
    """Get repository name from git remote."""
    remote = git("git remote get-url origin")

    if not remote:
        return ""

    repo = remote.rstrip("/").split("/")[-1]

    if repo.endswith(".git"):
        repo = repo[:-4]

    return repo


def get_branch():
    """Get current branch."""
    return git("git rev-parse --abbrev-ref HEAD")


def get_commit():
    """Get current short commit hash."""
    return git("git rev-parse --short HEAD")


def build_entry(tool, prompt, model="", result=""):
    """
    Build a log entry.

    IMPORTANT:
    The time is created here, where `now` is an actual datetime object.
    Both `timestamp` and `created_at` are included for compatibility
    with dashboards/server schemas.
    """
    now = datetime.now(UTC)
    iso_time = now.isoformat()

    return {
        "tool": tool,
        "event": "ManualLog",

        # Unique ID
        "entry_id": f"manual-{now.strftime('%Y%m%d-%H%M%S-%f')}",

        # Time fields
        "timestamp": iso_time,
        "created_at": iso_time,

        # AI information
        "model": model or tool,

        # Git/project information
        "repo": get_repo(),
        "branch": get_branch(),
        "commit": get_commit(),

        # User and prompt information
        "student": get_student(),
        "prompt": prompt[:1000],
        "response_summary": result[:500] if result else "",
    }


def save_entry(entry):
    """Append one entry to .ai-log/session.jsonl."""
    log_dir = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file = log_dir / "session.jsonl"

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                entry,
                ensure_ascii=False,
            )
            + "\n"
        )

    return log_file


def interactive_mode():
    """Interactive logging mode."""
    print("\n=== Manual AI Usage Logger ===")

    tool = input("AI tool [chatgpt]: ").strip() or "chatgpt"

    prompt = input("Prompt / nội dung công việc: ").strip()

    if not prompt:
        print(
            "[log] Prompt cannot be empty.",
            file=sys.stderr,
        )
        sys.exit(1)

    model = input(f"Model [{tool}]: ").strip() or tool
    result = input("Response summary (optional): ").strip()

    entry = build_entry(
        tool=tool,
        prompt=prompt,
        model=model,
        result=result,
    )

    log_file = save_entry(entry)

    print(f"\n[log] ✅ Logged: [{tool}] {prompt[:80]}")
    print(f"[log] 📁 Saved to: {log_file}")
    print(f"[log] 🕒 Time: {entry['created_at']}")


def cli_mode(args):
    """Command-line logging mode."""
    tool = args.tool.strip() if args.tool else "unknown"
    prompt = args.prompt.strip() if args.prompt else ""

    if not prompt:
        print(
            "[log] Error: --prompt is required.",
            file=sys.stderr,
        )
        sys.exit(1)

    model = args.model.strip() if args.model else tool
    result = (
        args.response_summary.strip()
        if args.response_summary
        else ""
    )

    entry = build_entry(
        tool=tool,
        prompt=prompt,
        model=model,
        result=result,
    )

    log_file = save_entry(entry)

    print(f"[log] ✅ Logged: [{tool}] {prompt[:80]}")
    print(f"[log] 📁 Saved to: {log_file}")
    print(f"[log] 🕒 Time: {entry['created_at']}")


def main():
    parser = argparse.ArgumentParser(
        description="Manually log AI tool usage."
    )

    parser.add_argument(
        "--tool",
        help="AI tool name, e.g. chatgpt, claude, gemini-web",
    )

    parser.add_argument(
        "--prompt",
        help="Description of what you asked/did with the AI tool",
    )

    parser.add_argument(
        "--model",
        default="",
        help="AI model name, e.g. gpt-5.6, claude",
    )

    parser.add_argument(
        "--response-summary",
        default="",
        help="Optional short summary of the AI response",
    )

    args = parser.parse_args()

    if not args.tool and not args.prompt:
        interactive_mode()
    else:
        cli_mode(args)


if __name__ == "__main__":
    main()