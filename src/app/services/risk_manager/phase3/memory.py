"""Session memory + user risk profile (controlled, no raw PII dumps).

In-process store with optional JSON file persistence so demo survives restarts.
Swap backend later (Redis/DB) without changing the public API.
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _persist_path() -> Path:
    raw = os.getenv("RISK_MANAGER_MEMORY_PATH", "eval/results/manager_memory.json")
    return Path(raw)


@dataclass
class RiskEventSummary:
    ts: float
    session_type: str
    action: str
    confidence: float
    signals: list[str] = field(default_factory=list)
    note: str = ""


@dataclass
class UserRiskProfile:
    user_id_hash: str
    risk_tier: str = "standard"  # standard | elevated | high
    recent_stops: int = 0
    recent_pauses: int = 0
    recent_continues: int = 0
    last_actions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def summary_text(self) -> str:
        return (
            f"tier={self.risk_tier}; stops={self.recent_stops}; "
            f"pauses={self.recent_pauses}; last={self.last_actions[-5:]}"
        )

    def apply_action(self, action: str) -> None:
        act = str(action).upper()
        self.last_actions.append(act)
        self.last_actions = self.last_actions[-20:]
        if act == "STOP":
            self.recent_stops += 1
        elif act == "PAUSE":
            self.recent_pauses += 1
        elif act == "CONTINUE":
            self.recent_continues += 1
        if self.recent_stops >= 2 or (self.recent_stops >= 1 and self.recent_pauses >= 2):
            self.risk_tier = "high"
        elif self.recent_stops >= 1 or self.recent_pauses >= 2:
            self.risk_tier = "elevated"


@dataclass
class SessionMemory:
    session_key: str
    user_id_hash: str
    events: list[RiskEventSummary] = field(default_factory=list)
    progressive_signals: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def append_event(self, ev: RiskEventSummary, *, max_events: int = 30) -> None:
        self.events.append(ev)
        if len(self.events) > max_events:
            self.events = self.events[-max_events:]
        for s in ev.signals:
            if s not in self.progressive_signals:
                self.progressive_signals.append(s)
        if len(self.progressive_signals) > 40:
            self.progressive_signals = self.progressive_signals[-40:]

    def controlled_summary(self) -> str:
        if not self.events:
            return "Chưa có sự kiện rủi ro trong phiên."
        last = self.events[-5:]
        parts = [
            f"{e.session_type}:{e.action}(c={e.confidence:.2f})" for e in last
        ]
        sigs = ", ".join(self.progressive_signals[-8:]) or "—"
        return (
            f"Phiên {self.session_key}: gần đây [{'; '.join(parts)}]; "
            f"signals tích lũy: {sigs}"
        )


class SessionMemoryStore:
    """Thread-safe memory with optional disk snapshot."""

    def __init__(self, *, persist: bool | None = None) -> None:
        self._sessions: dict[str, SessionMemory] = {}
        self._users: dict[str, UserRiskProfile] = {}
        self._lock = threading.Lock()
        if persist is None:
            persist = os.getenv("RISK_MANAGER_MEMORY_PERSIST", "true").lower() in (
                "1",
                "true",
                "yes",
            )
        self._persist = persist
        if self._persist:
            self._load()

    def _load(self) -> None:
        path = _persist_path()
        if not path.is_file():
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return
        for uid, up in (data.get("users") or {}).items():
            self._users[uid] = UserRiskProfile(
                user_id_hash=uid,
                risk_tier=up.get("risk_tier", "standard"),
                recent_stops=int(up.get("recent_stops", 0)),
                recent_pauses=int(up.get("recent_pauses", 0)),
                recent_continues=int(up.get("recent_continues", 0)),
                last_actions=list(up.get("last_actions") or [])[-20:],
                notes=list(up.get("notes") or [])[-10:],
            )
        for sk, sm in (data.get("sessions") or {}).items():
            events = [
                RiskEventSummary(
                    ts=float(e.get("ts", 0)),
                    session_type=str(e.get("session_type", "")),
                    action=str(e.get("action", "")),
                    confidence=float(e.get("confidence", 0)),
                    signals=list(e.get("signals") or []),
                    note=str(e.get("note") or "")[:120],
                )
                for e in (sm.get("events") or [])[-30:]
            ]
            self._sessions[sk] = SessionMemory(
                session_key=sk,
                user_id_hash=str(sm.get("user_id_hash") or ""),
                events=events,
                progressive_signals=list(sm.get("progressive_signals") or [])[-40:],
                created_at=float(sm.get("created_at") or time.time()),
            )

    def _save_unlocked(self) -> None:
        if not self._persist:
            return
        path = _persist_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "users": {
                    uid: {
                        "risk_tier": u.risk_tier,
                        "recent_stops": u.recent_stops,
                        "recent_pauses": u.recent_pauses,
                        "recent_continues": u.recent_continues,
                        "last_actions": u.last_actions[-20:],
                        "notes": u.notes[-10:],
                    }
                    for uid, u in self._users.items()
                },
                "sessions": {
                    sk: {
                        "user_id_hash": sm.user_id_hash,
                        "created_at": sm.created_at,
                        "progressive_signals": sm.progressive_signals[-40:],
                        "events": [
                            {
                                "ts": e.ts,
                                "session_type": e.session_type,
                                "action": e.action,
                                "confidence": e.confidence,
                                "signals": e.signals,
                                "note": e.note[:120],
                            }
                            for e in sm.events[-30:]
                        ],
                    }
                    for sk, sm in list(self._sessions.items())[-50:]
                },
            }
            path.write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception:
            pass

    def _session_unlocked(self, session_key: str, user_id_hash: str = "") -> SessionMemory:
        if session_key not in self._sessions:
            self._sessions[session_key] = SessionMemory(
                session_key=session_key,
                user_id_hash=user_id_hash or "anon",
            )
        return self._sessions[session_key]

    def _user_unlocked(self, user_id_hash: str) -> UserRiskProfile:
        if user_id_hash not in self._users:
            self._users[user_id_hash] = UserRiskProfile(user_id_hash=user_id_hash)
        return self._users[user_id_hash]

    def get_session(self, session_key: str, user_id_hash: str = "") -> SessionMemory:
        with self._lock:
            return self._session_unlocked(session_key, user_id_hash)

    def get_user(self, user_id_hash: str) -> UserRiskProfile:
        with self._lock:
            return self._user_unlocked(user_id_hash)

    def get_profile(self, user_id_hash: str) -> UserRiskProfile:
        """Alias used by status API / smoke scripts."""
        return self.get_user(user_id_hash)

    def record_decision(
        self,
        *,
        session_key: str,
        user_id_hash: str,
        session_type: str,
        action: str,
        confidence: float,
        signals: list[str] | None = None,
        note: str = "",
    ) -> None:
        signals = list(signals or [])
        with self._lock:
            mem = self._session_unlocked(session_key, user_id_hash)
            mem.user_id_hash = user_id_hash or mem.user_id_hash
            mem.append_event(
                RiskEventSummary(
                    ts=time.time(),
                    session_type=session_type,
                    action=str(action).upper(),
                    confidence=float(confidence),
                    signals=signals,
                    note=(note or "")[:120],
                )
            )
            user = self._user_unlocked(user_id_hash or "anon")
            user.apply_action(action)
            self._save_unlocked()

    def context_for_manager(self, session_key: str, user_id_hash: str) -> dict[str, Any]:
        with self._lock:
            mem = self._session_unlocked(session_key, user_id_hash)
            user = self._user_unlocked(user_id_hash or "anon")
            return {
                "session_summary": mem.controlled_summary(),
                "progressive_signals": list(mem.progressive_signals),
                "user_risk_tier": user.risk_tier,
                "user_profile": user.summary_text(),
            }


_STORE: SessionMemoryStore | None = None
_STORE_LOCK = threading.Lock()


def get_memory_store() -> SessionMemoryStore:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = SessionMemoryStore()
        return _STORE
