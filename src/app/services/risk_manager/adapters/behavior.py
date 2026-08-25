"""Adapter: behavioral signals / telemetry → behavior_profiler pack (rule-based v0)."""

from __future__ import annotations

from typing import Any, Iterable

from ..schema import BehaviorProfilerPack

_BEHAVIOR_KEYS = (
    "transaction_velocity",
    "behavioral_amount_anomaly",
    "new_device",
    "impossible_travel",
    "new_payee",
    "velocity",
)


def map_behavior_signals(
    signals: Iterable[str] | None = None,
    *,
    anomalies: list[str] | None = None,
    summary: str = "",
    available: bool | None = None,
) -> BehaviorProfilerPack:
    """
    Pass explicit anomalies, or filter from a flat signal list (e.g. from risk_rules).
    """
    found: list[str] = list(anomalies or [])
    if signals is not None:
        for s in signals:
            key = str(s).lower()
            for b in _BEHAVIOR_KEYS:
                if b in key and s not in found:
                    found.append(str(s))
                    break

    if available is None:
        available = bool(found) or bool(summary)

    if not summary and found:
        summary = "Phát hiện anomaly hành vi: " + ", ".join(found[:5])

    return BehaviorProfilerPack(
        available=bool(available),
        anomalies=found[:10],
        summary=summary[:300],
    )


def map_from_risk_signals(risk_signals: list[Any]) -> BehaviorProfilerPack:
    """Extract behavior-like codes from risk_rules signal candidates."""
    names: list[str] = []
    for s in risk_signals or []:
        if isinstance(s, dict):
            names.append(str(s.get("code") or s.get("name") or ""))
        elif hasattr(s, "code"):
            names.append(str(getattr(s, "code", "")))
        else:
            names.append(str(s))
    return map_behavior_signals(names)
