"""Phase 2/3 wire helpers — optional Bank Risk Manager overlay (flag-gated).

Production paths:
  - Guardian WS: maybe_apply_manager_to_guardian
  - Transaction assess: maybe_apply_manager_to_transaction

Never grants LLM execution tools. Fail-closed + safety floor inside orchestrator.
"""

from __future__ import annotations

import logging
import time
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


def _phase3_enabled() -> bool:
    try:
        settings = get_settings()
        if hasattr(settings, "risk_manager_phase3"):
            return bool(settings.risk_manager_phase3)
    except Exception:
        pass
    return True


def _run_manager_gate(
    req: Any,
    *,
    session_key: str = "default",
    use_llm: bool = True,
) -> Any:
    """Phase 3 multistep when enabled; else Phase 2 orchestrator."""
    from src.app.services.risk_manager.orchestrator import (
        run_manager,
        validate_manager_decision,
    )

    if _phase3_enabled():
        try:
            from src.app.services.risk_manager.phase3 import run_multistep_manager

            out, _trace = run_multistep_manager(
                req,
                session_key=session_key or "default",
                use_llm=use_llm,
                record_memory=True,
            )
            return validate_manager_decision(
                out,
                specialists=req.specialists,
                session_type=req.context.session_type,
            )
        except Exception as exc:
            logger.warning("phase3 multistep failed, fallback Phase2: %s", exc)

    gate = run_manager(req, use_llm=use_llm, deterministic_fallback=True)
    if gate.output is None:
        return gate
    return validate_manager_decision(
        gate.output,
        specialists=req.specialists,
        session_type=req.context.session_type,
    )


def maybe_apply_manager_to_guardian(
    result: Any,
    *,
    user_id_hash: str = "",
    confidence: float | None = None,
    guardian_error: str | None = None,
    session_key: str = "",
) -> Any:
    """Overlay Manager on Call Guardian result. Flag off → unchanged."""
    if not _manager_enabled():
        return result

    t0 = time.perf_counter()
    try:
        from src.app.services.risk_manager.orchestrator import (
            build_request_from_objects,
            enforce_action_allowed,
        )
        from src.app.services.scam_guardian import GuardianRiskResult

        req = build_request_from_objects(
            session_type="call_only",
            user_id_hash=user_id_hash,
            guardian_result=result if guardian_error is None else None,
            guardian_confidence=confidence,
            guardian_error=guardian_error,
        )
        checked = _run_manager_gate(
            req,
            session_key=session_key or user_id_hash or "guardian",
            use_llm=_use_llm(),
        )
        if checked.output is None:
            return result

        action = enforce_action_allowed(checked.output.recommended_action)
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

        try:
            from src.app.services.risk_manager.metrics import record_manager_call
            record_manager_call(action=action, latency_ms=(time.perf_counter()-t0)*1000, source="phase3" if _phase3_enabled() else "phase2")
        except Exception:
            pass
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
        try:
            from src.app.services.risk_manager.metrics import record_manager_call
            record_manager_call(action="SKIP", latency_ms=0, skipped=True, error=True)
        except Exception:
            pass
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
    session_key: str = "",
) -> tuple[float, str, str]:
    """Overlay Manager on transaction assess. Returns (score, level, explanation)."""
    if not _manager_enabled():
        return score, level, explanation

    t0 = time.perf_counter()
    try:
        from src.app.services.risk_manager.orchestrator import (
            build_request_from_objects,
            enforce_action_allowed,
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
        checked = _run_manager_gate(
            req,
            session_key=session_key or user_id_hash or "tx",
            use_llm=_use_llm(),
        )
        if not checked.output:
            return score, level, explanation

        action = enforce_action_allowed(checked.output.recommended_action)
        if action in ("STOP", "PAUSE"):
            new_level = "high"
            new_score = max(score_100 / 100.0 if score <= 1 else score_100, 0.7)
            if float(score) > 1.0:
                new_score = max(score_100, 70.0)
        elif action == "MONITOR":
            new_level = "medium" if str(level).lower() == "low" else level
            new_score = score
        else:
            new_level = level
            new_score = score

        if float(score) <= 1.0 and float(new_score) > 1.0:
            new_score = min(1.0, float(new_score) / 100.0)

        new_expl = f"{explanation} [Manager: {checked.output.rationale}]".strip()[:2000]
        try:
            from src.app.services.risk_manager.metrics import record_manager_call
            record_manager_call(action=action, latency_ms=(time.perf_counter()-t0)*1000, source="phase3" if _phase3_enabled() else "phase2")
        except Exception:
            pass
        return float(new_score), new_level, new_expl
    except Exception as exc:
        logger.warning("risk_manager overlay skipped (tx): %s", exc)
        try:
            from src.app.services.risk_manager.metrics import record_manager_call
            record_manager_call(action="SKIP", latency_ms=0, skipped=True, error=True)
        except Exception:
            pass
        return score, level, explanation
