#!/usr/bin/env python3
"""Phase 3 smoke: memory progressive + multistep + escalate (deterministic, fast)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

print("phase3 smoke: starting (use_llm=False, no API)...", flush=True)
t0 = time.perf_counter()

from src.app.services.risk_manager.orchestrator import build_request
from src.app.services.risk_manager.phase3 import (
    get_memory_store,
    record_hitl_feedback,
    run_multistep_manager,
)

print(f"imports ok ({time.perf_counter() - t0:.2f}s)", flush=True)


def main() -> int:
    store = get_memory_store()
    session_key = "smoke-session-1"
    uid = "user-smoke"

    # Step 1 — mild urgency
    req1 = build_request(
        session_type="call_only",
        user_id_hash=uid,
        guardian={
            "risk_score": 40,
            "risk_level": "warning",
            "recommended_action": "MONITOR",
            "signals": ["urgency"],
            "decision_confidence": 0.7,
            "explanation": "Thúc giục nhẹ",
        },
    )
    t1 = time.perf_counter()
    out1, _tr1 = run_multistep_manager(req1, session_key=session_key, use_llm=False)
    print(
        f"step1 {out1.recommended_action} conf={out1.confidence} "
        f"esc={out1.escalate_to_human} ({time.perf_counter() - t1:.3f}s)",
        flush=True,
    )

    # Step 2 — OTP progressive same session
    req2 = build_request(
        session_type="call_only",
        user_id_hash=uid,
        guardian={
            "risk_score": 90,
            "risk_level": "critical",
            "recommended_action": "STOP",
            "signals": ["otp_request", "bank_impersonation"],
            "decision_confidence": 0.92,
            "explanation": "Đòi OTP",
        },
    )
    t2 = time.perf_counter()
    out2, tr2 = run_multistep_manager(req2, session_key=session_key, use_llm=False)
    print(
        f"step2 {out2.recommended_action} conf={out2.confidence} "
        f"esc={out2.escalate_to_human} ({time.perf_counter() - t2:.3f}s)",
        flush=True,
    )

    mem_summary = tr2["memory_after"]["session_summary"]
    print("memory", mem_summary[:120], flush=True)
    print("rag", [r["id"] for r in tr2["rag_hits"]], flush=True)

    record_hitl_feedback(
        user_id_hash=uid,
        session_key=session_key,
        manager_action=out2.recommended_action,
        manager_confidence=out2.confidence,
        human_action="STOP",
        note="smoke agree",
    )
    print("profile", store.get_profile(uid).summary_text(), flush=True)

    sigs = list(tr2["memory_after"].get("progressive_signals") or [])
    has_otp = any("otp" in str(s).lower() for s in sigs)
    ok = out2.recommended_action == "STOP" and has_otp

    total = time.perf_counter() - t0
    print(f"{'PASS' if ok else 'FAIL'} sigs={sigs} total={total:.2f}s", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())