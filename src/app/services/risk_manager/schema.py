"""Schema + validation for Bank Risk Manager (Phase 2 v0.1).

Fail-closed: invalid output → caller must treat as PAUSE/STOP.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

RecommendedAction = Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]

ACTION_SEVERITY: dict[str, int] = {
    "CONTINUE": 0,
    "MONITOR": 1,
    "PAUSE": 2,
    "STOP": 3,
}


def max_severity_action(*actions: str | None) -> RecommendedAction:
    """Pick highest severity among specialist / manager actions."""
    best: RecommendedAction = "CONTINUE"
    best_rank = -1
    for a in actions:
        if not a:
            continue
        key = str(a).upper()
        rank = ACTION_SEVERITY.get(key, -1)
        if rank > best_rank:
            best_rank = rank
            best = key  # type: ignore[assignment]
    return best


class CallGuardianPack(BaseModel):
    available: bool = False
    risk_score: int = 0
    risk_level: str = "safe"
    recommended_action: str = "CONTINUE"
    signals: list[str] = Field(default_factory=list)
    decision_confidence: float = 0.0
    summary: str = ""


class TransactionRiskPack(BaseModel):
    available: bool = False
    risk_score: float = 0.0
    risk_level: str = "low"
    signals: list[str] = Field(default_factory=list)
    requires_hitl: bool = False
    summary: str = ""


class BehaviorProfilerPack(BaseModel):
    available: bool = False
    anomalies: list[str] = Field(default_factory=list)
    summary: str = ""


class SpecialistPack(BaseModel):
    call_guardian: CallGuardianPack = Field(default_factory=CallGuardianPack)
    transaction_risk: TransactionRiskPack = Field(default_factory=TransactionRiskPack)
    behavior_profiler: BehaviorProfilerPack = Field(default_factory=BehaviorProfilerPack)


class ManagerContext(BaseModel):
    user_id_hash: str = ""
    session_type: Literal["call_only", "tx_only", "call_and_tx"] = "call_and_tx"
    locale: str = "vi"
    timestamp_iso: str = ""


class ManagerRequest(BaseModel):
    request_id: str
    context: ManagerContext = Field(default_factory=ManagerContext)
    specialists: SpecialistPack = Field(default_factory=SpecialistPack)


class ManagerOutput(BaseModel):
    recommended_action: RecommendedAction
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = Field(min_length=20, max_length=800)
    evidence_used: list[str] = Field(default_factory=list)
    missing_info: list[str] = Field(default_factory=list)
    escalate_to_human: bool = False

    @field_validator("recommended_action", mode="before")
    @classmethod
    def _upper_action(cls, v: Any) -> str:
        return str(v).upper().strip()


def validate_manager_output(data: dict[str, Any]) -> ManagerOutput:
    """Parse + validate. Raises pydantic.ValidationError on failure (fail-closed)."""
    return ManagerOutput.model_validate(data)


def apply_safety_floor(
    output: ManagerOutput,
    specialists: SpecialistPack,
    *,
    session_type: str = "call_and_tx",
) -> ManagerOutput:
    """Hard policy after LLM: never below max specialist severity; fail-closed."""
    candidates: list[str] = [output.recommended_action]

    cg = specialists.call_guardian
    if cg.available:
        candidates.append(str(cg.recommended_action))
        level = str(cg.risk_level).lower()
        if level == "critical" or (level == "high" and cg.risk_score >= 85):
            candidates.append("STOP")
        elif level == "high" or cg.risk_score >= 70:
            candidates.append("PAUSE")

    tx = specialists.transaction_risk
    if tx.available:
        lvl = str(tx.risk_level).lower()
        sig = " ".join(tx.signals).lower()
        if "blacklist" in sig or tx.risk_score >= 90:
            candidates.append("STOP")
        elif lvl == "high" or (tx.requires_hitl and tx.risk_score >= 60):
            candidates.append("PAUSE")

    bp = specialists.behavior_profiler
    if bp.available and bp.anomalies:
        candidates.append("MONITOR")
        if any("velocity" in a.lower() or "anomaly" in a.lower() for a in bp.anomalies):
            candidates.append("PAUSE")

    # Guardian unavailable on a session that expects call context
    escalate = bool(output.escalate_to_human)
    if output.confidence < 0.55:
        escalate = True
    if session_type in ("call_only", "call_and_tx") and not cg.available:
        escalate = True
        if tx.available and tx.risk_score >= 40:
            candidates.append("PAUSE")
        elif session_type == "call_only":
            candidates.append("PAUSE")

    floored = max_severity_action(*candidates)
    updates: dict[str, Any] = {}
    if floored != output.recommended_action:
        updates["recommended_action"] = floored
    if escalate != output.escalate_to_human:
        updates["escalate_to_human"] = escalate
    if updates:
        return output.model_copy(update=updates)
    return output
