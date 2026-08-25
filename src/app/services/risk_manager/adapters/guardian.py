"""Adapter: Phase 1 Guardian / hybrid output → call_guardian specialist pack."""

from __future__ import annotations

from typing import Any

from ..schema import CallGuardianPack


def map_guardian_result(
    result: dict[str, Any] | Any | None,
    *,
    available: bool | None = None,
) -> CallGuardianPack:
    """
    Accepts:
      - dict from agent/hybrid JSON
      - GuardianRiskResult dataclass
      - None → available=False
    """
    if result is None:
        return CallGuardianPack(available=False if available is None else available)

    if not isinstance(result, dict):
        signals_raw = getattr(result, "signals", ()) or ()
        signals: list[str] = []
        for s in signals_raw:
            if hasattr(s, "signal_type"):
                signals.append(str(s.signal_type))
            elif isinstance(s, dict):
                signals.append(str(s.get("signal_type") or s.get("type") or s))
            else:
                signals.append(str(s))
        conf = getattr(result, "decision_confidence", None)
        if conf is None:
            conf = 0.7
        summary = str(getattr(result, "explanation", "") or "")
        return CallGuardianPack(
            available=True if available is None else available,
            risk_score=int(getattr(result, "risk_score", 0) or 0),
            risk_level=str(getattr(result, "risk_level", "safe") or "safe"),
            recommended_action=str(
                getattr(result, "recommended_action", "CONTINUE") or "CONTINUE"
            ).upper(),
            signals=signals[:6],
            decision_confidence=float(conf),
            summary=summary[:300],
        )

    avail = available if available is not None else True
    signals = result.get("signals") or []
    if isinstance(signals, list) and signals and isinstance(signals[0], dict):
        signals = [
            s.get("signal_type") or s.get("name") or s.get("type") or str(s)
            for s in signals
        ]

    summary = result.get("summary") or result.get("explanation") or ""
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
