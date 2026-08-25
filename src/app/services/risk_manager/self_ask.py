"""Manager self-ask — tối đa 1 vòng (Phase 2).

Khi missing_info quan trọng và confidence thấp, bổ sung pack từ specialist
deterministic (không loop LLM vô hạn).
"""

from __future__ import annotations

import logging
from typing import Any

from .schema import ManagerOutput, ManagerRequest, SpecialistPack
from .specialists.behavior import profile_behavior
from .specialists.evidence import build_evidence_pack

logger = logging.getLogger(__name__)

_IMPORTANT_MISSING = (
    "guardian",
    "call guardian",
    "call_guardian",
    "stt",
    "cuộc gọi",
    "transaction",
    "giao dịch",
)


def _needs_self_ask(out: ManagerOutput) -> bool:
    if out.confidence >= 0.7 and not out.missing_info:
        return False
    if out.recommended_action in ("STOP",) and out.confidence >= 0.85:
        return False  # đã chắc chắn
    for m in out.missing_info:
        low = m.lower()
        if any(k in low for k in _IMPORTANT_MISSING):
            return True
    return out.confidence < 0.55


def enrich_specialists_once(
    req: ManagerRequest,
    *,
    extra_signals: list[str] | None = None,
    telemetry: dict[str, Any] | None = None,
) -> ManagerRequest:
    """Fill behavior pack if empty; leave Guardian/Tx as-is (cannot invent)."""
    sp = req.specialists
    bp = sp.behavior_profiler
    if not bp.available or not bp.anomalies:
        sigs = list(extra_signals or [])
        if sp.transaction_risk.available:
            sigs.extend(sp.transaction_risk.signals)
        new_bp = profile_behavior(
            signal_names=sigs,
            telemetry=telemetry,
            explicit_anomalies=list(bp.anomalies) if bp.available else None,
        )
        sp = SpecialistPack(
            call_guardian=sp.call_guardian,
            transaction_risk=sp.transaction_risk,
            behavior_profiler=new_bp,
        )
        req = req.model_copy(update={"specialists": sp})
    return req


def run_with_optional_self_ask(
    req: ManagerRequest,
    *,
    use_llm: bool = True,
    extra_signals: list[str] | None = None,
    telemetry: dict[str, Any] | None = None,
) -> tuple[ManagerOutput, dict[str, Any]]:
    """
    Run Manager once; if self-ask needed, enrich specialists + run again (max 1).
    Returns (final_output, evidence_pack).
    """
    from .manager_agent import run_manager_deterministic, run_manager_llm

    runner = run_manager_llm if use_llm else run_manager_deterministic
    out = runner(req)
    asked = False
    if _needs_self_ask(out):
        asked = True
        logger.info("Manager self-ask: enrich specialists once missing=%s", out.missing_info)
        req2 = enrich_specialists_once(
            req, extra_signals=extra_signals, telemetry=telemetry
        )
        out = runner(req2)
        req = req2

    evidence = build_evidence_pack(req.specialists, out)
    evidence["self_ask_used"] = asked
    return out, evidence