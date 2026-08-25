"""In-process Manager observability (Phase 4).

Latency, action distribution, token/cost estimates, A/B labels, simple alerts.
Exposed via GET /api/v1/risk-manager/status → metrics.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Rough USD / 1M tokens (demo defaults; override via env later if needed)
_DEFAULT_COST_PER_1M = {
    "input": 0.05,
    "output": 0.08,
}


@dataclass
class _MetricsState:
    started_at: float = field(default_factory=time.time)
    calls: int = 0
    skips: int = 0
    errors: int = 0
    actions: Counter = field(default_factory=Counter)
    sources: Counter = field(default_factory=Counter)
    models: Counter = field(default_factory=Counter)
    prompt_versions: Counter = field(default_factory=Counter)
    latency_ms_sum: float = 0.0
    latency_ms_max: float = 0.0
    schema_ok: int = 0
    schema_fail: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    alert_count: int = 0


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
    model: str | None = None,
    prompt_version: str | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    with _LOCK:
        if skipped:
            _STATE.skips += 1
            _maybe_alert_unlocked()
            return
        _STATE.calls += 1
        if error:
            _STATE.errors += 1
        _STATE.actions[str(action or "UNKNOWN").upper()] += 1
        _STATE.sources[str(source)] += 1
        if model:
            _STATE.models[str(model)] += 1
        if prompt_version:
            _STATE.prompt_versions[str(prompt_version)] += 1
        _STATE.latency_ms_sum += max(0.0, float(latency_ms))
        _STATE.latency_ms_max = max(_STATE.latency_ms_max, float(latency_ms))
        if schema_ok:
            _STATE.schema_ok += 1
        else:
            _STATE.schema_fail += 1
        pt = max(0, int(prompt_tokens))
        ct = max(0, int(completion_tokens))
        _STATE.prompt_tokens += pt
        _STATE.completion_tokens += ct
        _STATE.estimated_cost_usd += (
            pt / 1_000_000 * _DEFAULT_COST_PER_1M["input"]
            + ct / 1_000_000 * _DEFAULT_COST_PER_1M["output"]
        )
        _maybe_alert_unlocked()


def _maybe_alert_unlocked() -> None:
    """Log-based alert when skip/error rates look unhealthy."""
    total = _STATE.calls + _STATE.skips
    if total < 20:
        return
    skip_rate = _STATE.skips / total
    err_rate = _STATE.errors / max(1, _STATE.calls)
    if skip_rate >= 0.3 or err_rate >= 0.15:
        _STATE.alert_count += 1
        if _STATE.alert_count <= 5 or _STATE.alert_count % 25 == 0:
            logger.warning(
                "manager_metrics_alert skip_rate=%.2f err_rate=%.2f calls=%s skips=%s",
                skip_rate,
                err_rate,
                _STATE.calls,
                _STATE.skips,
            )


def snapshot() -> dict[str, Any]:
    with _LOCK:
        n = max(1, _STATE.calls)
        total = _STATE.calls + _STATE.skips
        return {
            "uptime_sec": round(time.time() - _STATE.started_at, 1),
            "calls": _STATE.calls,
            "skips": _STATE.skips,
            "errors": _STATE.errors,
            "skip_rate": round(_STATE.skips / max(1, total), 4),
            "schema_ok": _STATE.schema_ok,
            "schema_fail": _STATE.schema_fail,
            "schema_ok_rate": round(
                _STATE.schema_ok / max(1, _STATE.schema_ok + _STATE.schema_fail), 4
            ),
            "latency_ms_avg": round(_STATE.latency_ms_sum / n, 2) if _STATE.calls else 0.0,
            "latency_ms_max": round(_STATE.latency_ms_max, 2),
            "action_distribution": dict(_STATE.actions),
            "source_distribution": dict(_STATE.sources),
            "model_distribution": dict(_STATE.models),
            "prompt_version_distribution": dict(_STATE.prompt_versions),
            "tokens": {
                "prompt": _STATE.prompt_tokens,
                "completion": _STATE.completion_tokens,
                "total": _STATE.prompt_tokens + _STATE.completion_tokens,
            },
            "estimated_cost_usd": round(_STATE.estimated_cost_usd, 6),
            "alert_count": _STATE.alert_count,
        }


def reset_for_tests() -> None:
    global _STATE
    with _LOCK:
        _STATE = _MetricsState()
