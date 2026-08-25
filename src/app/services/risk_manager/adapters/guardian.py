"""Adapter: Phase 1 Guardian / hybrid output → call_guardian specialist pack."""

from __future__ import annotations

from typing import Any

from ..schema import CallGuardianPack


def map_guardian_result(result: dict[str, Any] | None, *, available: bool | None = None) -> CallGuardianPack:
    """
    Accepts dict shaped like scam_guardian_agent / hybrid response:
      risk_score, risk_level, recommended_action, signals, decision_confidence, explanation
    """
    if result is None:
        return CallGuardianPack(available=False)

    avail = available if available is not None else True
    signals = result.get("signals") or []
    if isinstance(signals, list) and signals and isinstance(signals[0], dict):
        signals = [s.get("name") or s.get("type") or str(s) for s in signals]

    summary = (
        result.get("summary")
        or result.get("explanation")
        or ""
    )
    if len(summary) > 300:
        summary = summary[:297] + "..."

    return CallGuardianPack(
        available=avail,
        risk_score=int(result.get("risk_score") or 0),
        risk_level=str(result.get("risk_level") or "safe"),
        recommended_action=str(result.get("recommended_action") or "CONTINUE").upper(),
        signals=[str(s) for s in signals][:6],
        decision_confidence=float(result.get("decision_confidence") or 0.0),
        summary=summary,
    )
