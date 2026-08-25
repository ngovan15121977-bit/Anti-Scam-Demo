#!/usr/bin/env python3
"""Phase 3 eval: multistep Manager + memory progressive + RAG (deterministic by default).

Usage (repo root):
  python eval/scripts/run_phase3_eval.py
  python eval/scripts/run_phase3_eval.py --llm   # needs GROQ_API_KEY
  python eval/scripts/run_phase3_eval.py --dataset eval/dataset/manager_phase3_cases_v0.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.app.services.risk_manager.orchestrator import build_request
from src.app.services.risk_manager.phase3 import run_multistep_manager


def load_cases(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def case_to_request(case: dict):
    g = case.get("guardian")
    g_avail = case.get("guardian_available")
    if g_avail is False:
        g = None
        g_avail = False
    elif g is not None:
        g_avail = True
    tx = case.get("transaction")
    t_avail = True if tx else None
    return build_request(
        session_type=case.get("session_type", "call_only"),
        user_id_hash=case.get("user_id_hash", "eval-user"),
        guardian=g,
        guardian_available=g_avail,
        transaction=tx,
        transaction_available=t_avail,
        behavior_anomalies=case.get("behavior_anomalies"),
        request_id=case.get("id", "case"),
    )


def check_expected(case: dict, action: str, escalate: bool) -> list[str]:
    exp = case.get("expected") or {}
    errs: list[str] = []
    if "recommended_action" in exp and action != exp["recommended_action"]:
        errs.append(f"action want {exp['recommended_action']} got {action}")
    if "recommended_action_in" in exp and action not in exp["recommended_action_in"]:
        errs.append(f"action {action} not in {exp['recommended_action_in']}")
    if "must_not_action" in exp and action in exp["must_not_action"]:
        errs.append(f"forbidden action {action}")
    if exp.get("escalate_to_human") is True and not escalate:
        errs.append("expected escalate_to_human=true")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dataset",
        default=str(ROOT / "eval/dataset/manager_phase3_cases_v0.json"),
    )
    ap.add_argument("--llm", action="store_true", help="Use Manager LLM (needs API key)")
    ap.add_argument(
        "--out",
        default=str(ROOT / "eval/results/phase3_eval_latest.json"),
    )
    args = ap.parse_args()
    cases = load_cases(Path(args.dataset))
    use_llm = bool(args.llm)

    results = []
    passed = 0
    t0 = time.perf_counter()

    for case in cases:
        req = case_to_request(case)
        sk = case.get("session_key") or case["id"]
        try:
            out, trace = run_multistep_manager(
                req,
                session_key=sk,
                use_llm=use_llm,
                record_memory=True,
            )
            action = out.recommended_action
            errs = check_expected(case, action, out.escalate_to_human)
            ok = not errs
            if ok:
                passed += 1
            results.append(
                {
                    "id": case["id"],
                    "ok": ok,
                    "action": action,
                    "confidence": out.confidence,
                    "escalate": out.escalate_to_human,
                    "rationale": out.rationale[:240],
                    "errors": errs,
                    "rag": [r.get("id") for r in (trace.get("rag_hits") or [])],
                    "memory": (trace.get("memory_after") or {}).get("session_summary", "")[
                        :160
                    ],
                }
            )
            status = "PASS" if ok else "FAIL"
            print(f"{status} {case['id']} → {action} c={out.confidence} esc={out.escalate_to_human}")
            if errs:
                for e in errs:
                    print(f"    ! {e}")
        except Exception as exc:
            results.append(
                {
                    "id": case["id"],
                    "ok": False,
                    "errors": [str(exc)],
                }
            )
            print(f"FAIL {case['id']} → exception: {exc}")

    elapsed = time.perf_counter() - t0
    summary = {
        "total": len(cases),
        "passed": passed,
        "pass_rate": round(passed / max(len(cases), 1), 4),
        "use_llm": use_llm,
        "elapsed_s": round(elapsed, 3),
        "results": results,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"\n=== Phase 3 eval: {passed}/{len(cases)} "
        f"({summary['pass_rate']*100:.1f}%) in {elapsed:.2f}s → {out_path}"
    )
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
