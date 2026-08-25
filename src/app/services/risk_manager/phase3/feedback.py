"""HITL feedback loop — record human decisions for later calibration (Phase 3).

Does not auto-change policy weights without review (fail-closed + human authority).
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_DEFAULT_PATH = Path("eval/results/hitl_feedback.jsonl")


def record_hitl_feedback(
    *,
    user_id_hash: str,
    session_key: str,
    manager_action: str,
    manager_confidence: float,
    human_action: str,
    agreed: bool | None = None,
    note: str = "",
    path: Path | None = None,
) -> None:
    path = path or _DEFAULT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    if agreed is None:
        agreed = str(manager_action).upper() == str(human_action).upper()
    row = {
        "ts": time.time(),
        "user_id_hash": user_id_hash,
        "session_key": session_key,
        "manager_action": str(manager_action).upper(),
        "manager_confidence": float(manager_confidence),
        "human_action": str(human_action).upper(),
        "agreed": bool(agreed),
        "note": note[:300],
    }
    with _LOCK:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_feedback_hints(path: Path | None = None, *, limit: int = 20) -> dict[str, Any]:
    """Aggregate simple disagreement rates for prompt context (not auto-policy)."""
    path = path or _DEFAULT_PATH
    if not path.is_file():
        return {"samples": 0, "agree_rate": None, "hint": ""}
    rows: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    rows = rows[-limit:]
    if not rows:
        return {"samples": 0, "agree_rate": None, "hint": ""}
    agree = sum(1 for r in rows if r.get("agreed"))
    rate = agree / len(rows)
    hint = ""
    if rate < 0.6:
        hint = (
            "Lịch sử HITL gần đây: Manager và người xử lý hay lệch — "
            "ưu tiên escalate khi confidence trung bình."
        )
    return {"samples": len(rows), "agree_rate": round(rate, 3), "hint": hint}