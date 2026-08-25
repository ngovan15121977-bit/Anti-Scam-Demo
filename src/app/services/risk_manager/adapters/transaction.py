"""Adapter: risk_rules / assess / transaction_graph → transaction_risk pack."""

from __future__ import annotations

from typing import Any

from ..schema import TransactionRiskPack


def map_transaction_result(
    result: dict[str, Any] | None,
    *,
    available: bool | None = None,
) -> TransactionRiskPack:
    """
    Accepts assess-style dict:
      risk_score, risk_level, signals (list[str] or list[obj]), requires_hitl, explanation
    """
    if result is None:
        return TransactionRiskPack(available=False)

    avail = available if available is not None else True
    raw_signals = result.get("signals") or []
    signals: list[str] = []
    for s in raw_signals:
        if isinstance(s, dict):
            signals.append(str(s.get("code") or s.get("name") or s.get("type") or s))
        else:
            signals.append(str(s))

    summary = result.get("summary") or result.get("explanation") or ""
    if len(summary) > 300:
        summary = summary[:297] + "..."

    requires = bool(result.get("requires_hitl"))
    if not requires and str(result.get("risk_level", "")).lower() in ("medium", "high"):
        requires = True

    return TransactionRiskPack(
        available=avail,
        risk_score=float(result.get("risk_score") or 0),
        risk_level=str(result.get("risk_level") or "low"),
        signals=signals[:8],
        requires_hitl=requires,
        summary=summary,
    )
