"""In-process Manager observability (Phase 4 foundation).

Tracks latency, action distribution, overlay skips. Not a full Prometheus stack —
enough for demo + ops dashboard via GET /api/v1/risk-manager/status.
"""

from __future__ import annotations

import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any


@dataclass
class _MetricsState:
    started_at: float = field(default_factory=time.time)
    calls: int = 0
    skips: int = 0
    errors: int = 0
    actions: Counter = field(default_factory=Counter)
    sources: Counter = field(default_factory=Counter)  # phase3 | phase2 | deterministic | fail_closed
    latency_ms_sum: float = 0.0
    latency_ms_max: float = 0.0
    schema_ok: int = 0
    schema_fail: int = 0


_LOCK = threading.Lock()
_STATE = _MetricsState()


def record_manager_call(
    *,
    action: str,
    latency_ms: float,
    source: str = "manager",
    skipped: bool = False,
    error: bool = False,
    schema_ok: bool = True,
) -> None:
    with _LOCK:
        if skipped:
            _STATE.skips += 1
            return
        _STATE.calls += 1
        if error:
            _STATE.errors += 1
        act = str(action or "UNKNOWN").upper()
        _STATE.actions[act] += 1
        _STATE.sources[str(source)] += 1
        _STATE.latency_ms_sum += max(0.0, float(latency_ms))
        _STATE.latency_ms_max = max(_STATE.latency_ms_max, float(latency_ms))
        if schema_ok:
            _STATE.schema_ok += 1
        else:
            _STATE.schema_fail += 1


def snapshot() -> dict[str, Any]:
    with _LOCK:
        n = max(1, _STATE.calls)
        return {
            "uptime_sec": round(time.time() - _STATE.started_at, 1),
            "calls": _STATE.calls,
            "skips": _STATE.skips,
            "errors": _STATE.errors,
            "schema_ok": _STATE.schema_ok,
            "schema_fail": _STATE.schema_fail,
            "schema_ok_rate": round(_STATE.schema_ok / max(1, _STATE.schema_ok + _STATE.schema_fail), 4),
            "latency_ms_avg": round(_STATE.latency_ms_sum / n, 2) if _STATE.calls else 0.0,
            "latency_ms_max": round(_STATE.latency_ms_max, 2),
            "action_distribution": dict(_STATE.actions),
            "source_distribution": dict(_STATE.sources),
        }


def reset_for_tests() -> None:
    global _STATE
    with _LOCK:
        _STATE = _MetricsState()
