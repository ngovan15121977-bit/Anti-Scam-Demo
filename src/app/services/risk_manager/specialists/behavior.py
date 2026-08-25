"""Behavior Profiler Specialist — deterministic v0 (Phase 2 close-out).

No LLM. Maps risk signals + optional telemetry into BehaviorProfilerPack.
"""

from __future__ import annotations

from typing import Any, Iterable

from ..schema import BehaviorProfilerPack

_ANOMALY_HINTS = (
    ("transaction_velocity", "Nhiều giao dịch trong thời gian ngắn"),
    ("behavioral_amount_anomaly", "Số tiền lệch so với lịch sử"),
    ("unusual_amount", "Số tiền bất thường"),
    ("new_payee", "Người nhận mới"),
    ("new_device", "Thiết bị mới"),
    ("impossible_travel", "Di chuyển địa lý không khả thi"),
    ("velocity", "Tần suất giao dịch cao"),
)


def profile_behavior(
    *,
    signal_names: Iterable[str] | None = None,
    telemetry: dict[str, Any] | None = None,
    explicit_anomalies: list[str] | None = None,
) -> BehaviorProfilerPack:
    """Build behavior pack from signals / telemetry. Always available=True when called."""
    anomalies: list[str] = list(explicit_anomalies or [])
    notes: list[str] = []

    for name in signal_names or []:
        key = str(name).lower()
        for hint, desc in _ANOMALY_HINTS:
            if hint in key and name not in anomalies:
                anomalies.append(str(name))
                notes.append(desc)
                break

    tel = telemetry or {}
    if tel.get("new_device"):
        if "new_device" not in anomalies:
            anomalies.append("new_device")
            notes.append("Thiết bị mới")
    if tel.get("location_jump"):
        if "impossible_travel" not in anomalies:
            anomalies.append("impossible_travel")
            notes.append("Nhảy vị trí bất thường")

    summary = "; ".join(notes[:4]) if notes else "Không anomaly hành vi đáng kể."
    return BehaviorProfilerPack(
        available=True,
        anomalies=anomalies[:10],
        summary=summary[:300],
    )