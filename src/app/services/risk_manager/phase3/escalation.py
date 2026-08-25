"""Smart escalation — when to force human (Phase 3)."""

from __future__ import annotations

from typing import Any


def should_escalate(
    *,
    confidence: float,
    action: str,
    missing_info: list[str] | None = None,
    user_risk_tier: str = "standard",
    progressive_signal_count: int = 0,
    specialist_conflict: bool = False,
    requires_hitl: bool = False,
) -> bool:
    """
    Escalate when:
    - low confidence
    - missing critical call evidence
    - progressive multi-signal over long call
    - specialist conflict + not already STOP certainty
    - HITL required by transaction rules
    - elevated user tier on PAUSE
    """
    act = str(action).upper()
    if confidence < 0.55:
        return True
    if requires_hitl:
        return True
    miss = " ".join(missing_info or []).lower()
    if any(k in miss for k in ("guardian", "cuộc gọi", "stt", "call")):
        return True
    if progressive_signal_count >= 5 and act in ("PAUSE", "MONITOR"):
        return True
    if specialist_conflict and act != "STOP":
        return True
    if user_risk_tier in ("elevated", "high") and act in ("PAUSE", "STOP"):
        return True
    if act == "STOP" and confidence < 0.75:
        return True
    return False
