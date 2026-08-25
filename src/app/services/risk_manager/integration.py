"""Phase 2 wire helpers — optional Manager overlay (flag-gated).

Copy to: src/app/services/risk_manager/integration.py

Usage (Guardian WS) after specialist returns GuardianRiskResult:
    from src.app.services.risk_manager.integration import maybe_apply_manager_to_guardian
    result = maybe_apply_manager_to_guardian(
        result,
        user_id_hash=str(session.user_id),
        session_type="call_only",
    )

Usage (Transaction assess) after graph_result:
    from src.app.services.risk_manager.integration import maybe_apply_manager_to_transaction
    score, level, explanation, candidates = maybe_apply_manager_to_transaction(...)
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

from src.app.config import get_settings

logger = logging.getLogger(__name__)


def _manager_enabled() -> bool:
    try:
        return bool(get_settings().risk_manager_enabled)
    except Exception:
        return False


def _use_llm() -> bool:
    try:
        return bool(get_settings().risk_manager_use_llm)
    except Exception:
        return True


def maybe_apply_manager_to_guardian(
    result: Any,
    *,
    user_id_hash: str = "",
    confidence: float | None = None,
    guardian_error: str | None = None,
) -> Any:
    """
    Overlay Bank Risk Manager on Call Guardian result.
    If flag off or Manager fails → return original result unchanged.
    Never lowers severity below specialist (safety floor inside orchestrator).
    """
    if not _manager_enabled():
        return result

    try:
        from src.app.services.risk_manager.orchestrator import (
            build_request_from_objects,
            enforce_action_allowed,
            run_manager,
            validate_manager_decision,
        )
        from src.app.services.scam_guardian import GuardianRiskResult

        req = build_request_from_objects(
            session_type="call_only",
            user_id_hash=user_id_hash,
            guardian_result=result if guardian_error is None else None,
            guardian_confidence=confidence,
            guardian_error=guardian_error,
        )
        gate = run_manager(
            req,
            use_llm=_use_llm(),
            deterministic_fallback=True,
        )
        if gate.output is None:
            return result

        checked = validate_manager_decision(
            gate.output,
            specialists=req.specialists,
            session_type="call_only",
        )
        if checked.output is None:
            return result

        action = enforce_action_allowed(checked.output.recommended_action)
        # Map action → level/score floors (backend still owns latch STOP)
        if action == "STOP":
            level, score = "critical", max(int(getattr(result, "risk_score", 0) or 0), 85)
        elif action == "PAUSE":
            level, score = "high", max(int(getattr(result, "risk_score", 0) or 0), 60)
        elif action == "MONITOR":
            level, score = "warning", max(int(getattr(result, "risk_score", 0) or 0), 30)
        else:
            level = str(getattr(result, "risk_level", "safe"))
            score = int(getattr(result, "risk_score", 0) or 0)

        rationale = checked.output.rationale
        base_expl = str(getattr(result, "explanation", "") or "")
        explanation = f"{base_expl} [Manager: {rationale}]".strip()[:1000]

        if isinstance(result, GuardianRiskResult):
            return replace(
                result,
                risk_score=min(100, score),
                risk_level=level,
                recommended_action=action,
                explanation=explanation,
            )
        return result
    except Exception as exc:
        logger.warning("risk_manager overlay skipped (guardian): %s", exc)
        return result


def maybe_apply_manager_to_transaction(
    *,
    score: float,
    level: str,
    explanation: str,
    signal_types: list[str],
    requires_hitl: bool,
    user_id_hash: str = "",
    active_guardian_action: str | None = None,
    active_guardian_score: int | None = None,
) -> tuple[float, str, str]:
    """
    Optional Manager overlay for transaction assess.
    Returns (score, level, explanation). Flag off → inputs unchanged.
    """
    if not _manager_enabled():
        return score, level, explanation

    try:
        from src.app.services.risk_manager.orchestrator import (
            build_request_from_objects,
            enforce_action_allowed,
            run_manager,
            validate_manager_decision,
        )

        score_100 = float(score) * 100.0 if float(score) <= 1.0 else float(score)
        tx_dict = {
            "risk_score": score_100,
            "risk_level": level,
            "signals": list(signal_types),
            "requires_hitl": requires_hitl,
            "explanation": explanation,
        }
        guardian_result = None
        if active_guardian_action:
            guardian_result = {
                "risk_score": int(active_guardian_score or 0),
                "risk_level": "critical" if active_guardian_action == "STOP" else "high",
                "recommended_action": active_guardian_action,
                "signals": ["active_scam_guardian"],
                "decision_confidence": 0.85,
                "explanation": f"Active Guardian action={active_guardian_action}",
            }

        session_type = "call_and_tx" if guardian_result else "tx_only"
        req = build_request_from_objects(
            session_type=session_type,
            user_id_hash=user_id_hash,
            guardian_result=guardian_result,
            transaction_result=tx_dict,
            risk_signals=signal_types,
        )
        gate = run_manager(req, use_llm=_use_llm(), deterministic_fallback=True)
        if not gate.output:
            return score, level, explanation
        checked = validate_manager_decision(
            gate.output, specialists=req.specialists, session_type=session_type
        )
        if not checked.output:
            return score, level, explanation

        action = enforce_action_allowed(checked.output.recommended_action)
        # Translate Manager action → tx risk level (existing enum low/medium/high)
        if action in ("STOP", "PAUSE"):
            new_level = "high"
            new_score = max(score_100 / 100.0 if score <= 1 else score_100, 0.7)
            if score <= 1.0:
                pass
            else:
                new_score = max(score_100, 70.0)
        elif action == "MONITOR":
            new_level = "medium" if level == "low" else level
            new_score = score
        else:
            new_level = level
            new_score = score

        # Normalize score scale to match input
        if float(score) <= 1.0 and new_score > 1.0:
            new_score = min(1.0, new_score / 100.0)

        new_expl = f"{explanation} [Manager: {checked.output.rationale}]".strip()[:2000]
        return float(new_score), new_level, new_expl
    except Exception as exc:
        logger.warning("risk_manager overlay skipped (tx): %s", exc)
        return score, level, explanation
