"""Orchestrator Phase 2 — gather specialist packs → Manager → validate.

Backend MUST call validate_manager_decision() before enforcing any action.
LLM never executes transfer / lock / DB writes.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from .adapters.behavior import map_behavior_signals, map_from_risk_signals
from .adapters.guardian import map_guardian_result
from .adapters.transaction import map_transaction_result
from .manager_agent import run_manager_deterministic, run_manager_llm
from .schema import (
    ManagerContext,
    ManagerOutput,
    ManagerRequest,
    SpecialistPack,
    apply_safety_floor,
    max_severity_action,
    validate_manager_output,
)

logger = logging.getLogger(__name__)

SessionType = Literal["call_only", "tx_only", "call_and_tx"]


@dataclass
class ManagerGateResult:
    """Validated recommendation ready for backend policy."""

    ok: bool
    output: ManagerOutput | None
    error: str | None = None
    request_id: str = ""
    source: str = "manager"  # manager | deterministic | fail_closed


def build_request(
    *,
    session_type: SessionType = "call_and_tx",
    user_id_hash: str = "",
    guardian: dict[str, Any] | None = None,
    guardian_available: bool | None = None,
    transaction: dict[str, Any] | None = None,
    transaction_available: bool | None = None,
    behavior_signals: list[str] | None = None,
    behavior_anomalies: list[str] | None = None,
    request_id: str | None = None,
) -> ManagerRequest:
    """Build ManagerRequest from raw service outputs (dicts or already mapped)."""
    cg = map_guardian_result(guardian, available=guardian_available)
    tx = map_transaction_result(transaction, available=transaction_available)
    bp = map_behavior_signals(
        behavior_signals,
        anomalies=behavior_anomalies,
    )
    return ManagerRequest(
        request_id=request_id or str(uuid.uuid4()),
        context=ManagerContext(
            user_id_hash=user_id_hash,
            session_type=session_type,
            locale="vi",
        ),
        specialists=SpecialistPack(
            call_guardian=cg,
            transaction_risk=tx,
            behavior_profiler=bp,
        ),
    )


def build_request_from_objects(
    *,
    session_type: SessionType = "call_and_tx",
    user_id_hash: str = "",
    guardian_result: Any = None,
    guardian_confidence: float | None = None,
    guardian_error: str | None = None,
    transaction_result: Any = None,
    risk_signals: list[Any] | None = None,
    request_id: str | None = None,
) -> ManagerRequest:
    """Map GuardianRiskResult / assess-like objects → ManagerRequest."""
    guardian_dict: dict[str, Any] | None = None
    g_avail: bool | None = None

    if guardian_error:
        g_avail = False
    elif guardian_result is not None:
        g_avail = True
        signals = []
        raw_signals = getattr(guardian_result, "signals", None) or []
        for s in raw_signals:
            if hasattr(s, "signal_type"):
                signals.append(s.signal_type)
            elif isinstance(s, dict):
                signals.append(str(s.get("signal_type") or s.get("type") or s))
            else:
                signals.append(str(s))
        guardian_dict = {
            "risk_score": int(getattr(guardian_result, "risk_score", 0) or 0),
            "risk_level": str(getattr(guardian_result, "risk_level", "safe")),
            "recommended_action": str(
                getattr(guardian_result, "recommended_action", "CONTINUE")
            ),
            "signals": signals,
            "decision_confidence": float(
                guardian_confidence
                if guardian_confidence is not None
                else getattr(guardian_result, "decision_confidence", 0.7) or 0.7
            ),
            "explanation": str(getattr(guardian_result, "explanation", "") or ""),
        }

    tx_dict: dict[str, Any] | None = None
    t_avail: bool | None = None
    if transaction_result is not None:
        t_avail = True
        if isinstance(transaction_result, dict):
            tx_dict = transaction_result
        else:
            # RiskResult from risk_engine or graph state
            score = getattr(transaction_result, "final_score", None)
            if score is None:
                score = getattr(transaction_result, "risk_score", 0)
            # risk_engine often 0..1
            score_f = float(score or 0)
            if score_f <= 1.0:
                score_f = score_f * 100.0
            level = str(
                getattr(transaction_result, "level", None)
                or getattr(transaction_result, "risk_level", "low")
            )
            signals: list[str] = []
            for m in getattr(transaction_result, "matched_blacklist", None) or []:
                signals.append("blacklist_exact_match")
            for p in getattr(transaction_result, "matched_patterns", None) or []:
                name = p.get("name") if isinstance(p, dict) else str(p)
                if name:
                    signals.append(f"pattern:{name}")
            for s in getattr(transaction_result, "signals", None) or []:
                if hasattr(s, "code"):
                    signals.append(str(s.code))
                elif isinstance(s, dict):
                    signals.append(str(s.get("code") or s.get("name") or s))
                else:
                    signals.append(str(s))
            requires = level.lower() in ("medium", "high", "critical") or score_f >= 50
            tx_dict = {
                "risk_score": score_f,
                "risk_level": level,
                "signals": signals,
                "requires_hitl": requires,
                "explanation": str(
                    getattr(transaction_result, "reason", None)
                    or getattr(transaction_result, "explanation", "")
                    or ""
                ),
            }

    bp = map_from_risk_signals(risk_signals or [])
    if tx_dict and tx_dict.get("signals"):
        extra = map_behavior_signals(tx_dict["signals"])
        if extra.anomalies:
            bp = extra

    return build_request(
        session_type=session_type,
        user_id_hash=user_id_hash,
        guardian=guardian_dict,
        guardian_available=g_avail,
        transaction=tx_dict,
        transaction_available=t_avail,
        behavior_anomalies=list(bp.anomalies) if bp.available else None,
        request_id=request_id,
    )


def run_manager(
    req: ManagerRequest,
    *,
    use_llm: bool = True,
    deterministic_fallback: bool = True,
) -> ManagerGateResult:
    """Run Manager LLM (or deterministic). Always applies safety floor + validate."""
    rid = req.request_id
    try:
        if use_llm:
            try:
                out = run_manager_llm(req)
                return ManagerGateResult(
                    ok=True, output=out, request_id=rid, source="manager"
                )
            except Exception as exc:
                logger.warning("Manager LLM failed: %s", exc)
                if not deterministic_fallback:
                    return ManagerGateResult(
                        ok=False,
                        output=None,
                        error=str(exc),
                        request_id=rid,
                        source="manager",
                    )
                out = run_manager_deterministic(req)
                return ManagerGateResult(
                    ok=True,
                    output=out,
                    error=f"llm_fallback:{exc}",
                    request_id=rid,
                    source="deterministic",
                )
        out = run_manager_deterministic(req)
        return ManagerGateResult(
            ok=True, output=out, request_id=rid, source="deterministic"
        )
    except Exception as exc:
        logger.exception("Manager hard failure")
        # Fail-closed synthetic output
        closed = ManagerOutput(
            recommended_action="PAUSE",
            confidence=0.0,
            rationale=(
                "Hệ thống quản lý rủi ro không hoàn tất đánh giá. "
                "Áp dụng fail-closed: tạm dừng và chuyển người xử lý."
            ),
            evidence_used=[],
            missing_info=["manager_output"],
            escalate_to_human=True,
        )
        closed = apply_safety_floor(
            closed, req.specialists, session_type=req.context.session_type
        )
        return ManagerGateResult(
            ok=True,
            output=closed,
            error=str(exc),
            request_id=rid,
            source="fail_closed",
        )


def validate_manager_decision(
    data: dict[str, Any] | ManagerOutput,
    *,
    specialists: SpecialistPack | None = None,
    session_type: SessionType = "call_and_tx",
) -> ManagerGateResult:
    """
    Backend gate: parse + optional safety floor.
    If invalid → fail-closed PAUSE (ok=True with synthetic output, or ok=False).
    """
    try:
        if isinstance(data, ManagerOutput):
            out = data
        else:
            out = validate_manager_output(data)
        if specialists is not None:
            out = apply_safety_floor(out, specialists, session_type=session_type)
        return ManagerGateResult(ok=True, output=out, source="manager")
    except Exception as exc:
        closed = ManagerOutput(
            recommended_action="PAUSE",
            confidence=0.0,
            rationale=(
                "Khuyến nghị Manager không hợp lệ schema. "
                "Fail-closed: tạm dừng, không tự CONTINUES."
            ),
            evidence_used=[],
            missing_info=["valid_manager_output"],
            escalate_to_human=True,
        )
        return ManagerGateResult(
            ok=False, output=closed, error=str(exc), source="fail_closed"
        )


def enforce_action_allowed(
    manager_action: str,
    *,
    backend_policy_max: str | None = None,
) -> str:
    """
    Final action string for backend.
    Optional backend_policy_max e.g. HITL already decided STOP → keep max severity.
    """
    if backend_policy_max:
        return max_severity_action(manager_action, backend_policy_max)
    return str(manager_action).upper()


def run_manager_with_evidence(
    req: ManagerRequest,
    *,
    use_llm: bool = True,
    deterministic_fallback: bool = True,
    extra_signals: list | None = None,
    telemetry: dict | None = None,
) -> tuple[ManagerGateResult, dict]:
    """Phase 2 close-out: Manager + optional 1x self-ask + evidence pack."""
    from .self_ask import run_with_optional_self_ask

    try:
        out, evidence = run_with_optional_self_ask(
            req,
            use_llm=use_llm,
            extra_signals=extra_signals,
            telemetry=telemetry,
        )
        return (
            ManagerGateResult(ok=True, output=out, request_id=req.request_id, source="manager"),
            evidence,
        )
    except Exception as exc:
        logger.warning("run_manager_with_evidence failed: %s", exc)
        gate = run_manager(req, use_llm=False, deterministic_fallback=True)
        from .specialists.evidence import build_evidence_pack
        ev = build_evidence_pack(req.specialists, gate.output)
        ev["self_ask_used"] = False
        ev["error"] = str(exc)
        return gate, ev