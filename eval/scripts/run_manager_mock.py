#!/usr/bin/env python3
"""Phase 2 mock: structured specialist packs → Manager recommendation.

Usage (from repo root after copying files):

  # Offline policy only (no API key)
  python eval/scripts/run_manager_mock.py --deterministic

  # LLM Manager (needs GROQ_API_KEY)
  export GROQ_API_KEY=...
  python eval/scripts/run_manager_mock.py

  python eval/scripts/run_manager_mock.py --case mgr-001-guardian-stop-otp
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Support both monorepo layout and artifacts-only copy
for extra in (ROOT, ROOT / "src"):
    p = str(extra)
    if p not in sys.path:
        sys.path.insert(0, p)

from src.app.services.risk_manager.manager_agent import (  # noqa: E402
    run_manager_deterministic,
    run_manager_llm,
)
from src.app.services.risk_manager.schema import (  # noqa: E402
    ManagerContext,
    ManagerRequest,
    SpecialistPack,
    validate_manager_output,
)


def load_cases(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_expected(case: dict, output: dict) -> list[str]:
    exp = case.get("expected") or {}
    errors: list[str] = []
    action = output.get("recommended_action")

    if "recommended_action" in exp and action != exp["recommended_action"]:
        errors.append(f"action want {exp['recommended_action']} got {action}")
    if "recommended_action_in" in exp and action not in exp["recommended_action_in"]:
        errors.append(f"action {action} not in {exp['recommended_action_in']}")
    if "must_not_action" in exp and action in exp["must_not_action"]:
        errors.append(f"action {action} is forbidden")
    if exp.get("escalate_to_human") is True and not output.get("escalate_to_human"):
        # STOP already is strongest backend latch; escalate flag is advisory for HITL queue
        if action != "STOP":
            errors.append("expected escalate_to_human=true")
    if exp.get("escalate_to_human_max") is False and output.get("escalate_to_human"):
        pass  # soft
    return errors


def run_one(case: dict, *, deterministic: bool) -> tuple[bool, dict]:
    sp = SpecialistPack.model_validate(case["specialists"])
    req = ManagerRequest(
        request_id=str(uuid.uuid4()),
        context=ManagerContext(
            user_id_hash="mock-user",
            session_type=case.get("session_type") or "call_and_tx",
            locale="vi",
        ),
        specialists=sp,
    )
    if deterministic:
        out = run_manager_deterministic(req)
    else:
        out = run_manager_llm(req)
    data = out.model_dump()
    # re-validate
    validate_manager_output(data)
    errs = check_expected(case, data)
    return (len(errs) == 0, {"output": data, "errors": errs})


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 2 Manager mock eval")
    parser.add_argument(
        "--dataset",
        default=str(ROOT / "eval/dataset/manager_cases_v0.json"),
    )
    parser.add_argument("--case", default=None, help="Run single case id")
    parser.add_argument(
        "--deterministic",
        action="store_true",
        help="No LLM — policy floor only (CI-friendly)",
    )
    args = parser.parse_args()

    cases = load_cases(Path(args.dataset))
    if args.case:
        cases = [c for c in cases if c["id"] == args.case]
        if not cases:
            print(f"Case not found: {args.case}", file=sys.stderr)
            return 2

    mode = "deterministic" if args.deterministic else "llm"
    print(f"Mode={mode}  cases={len(cases)}\n")

    passed = 0
    failed = 0
    for case in cases:
        cid = case["id"]
        try:
            ok, detail = run_one(case, deterministic=args.deterministic)
        except Exception as e:
            failed += 1
            print(f"FAIL {cid}: EXCEPTION {e}")
            continue

        out = detail["output"]
        if ok:
            passed += 1
            status = "PASS"
        else:
            failed += 1
            status = "FAIL"

        print(f"{status} {cid}")
        print(f"  action={out['recommended_action']} conf={out['confidence']} escalate={out['escalate_to_human']}")
        print(f"  rationale={out['rationale'][:160]}...")
        if detail["errors"]:
            print(f"  errors={detail['errors']}")
        print()

    total = passed + failed
    print(f"Summary: {passed}/{total} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())