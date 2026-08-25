"""Session memory + user risk profile (controlled, no raw PII dumps).

In-process store for demo; swap backend later (Redis/DB) without changing API.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any


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
    """Thread-safe. Uses RLock so nested helpers never deadlock."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionMemory] = {}
        self._profiles: dict[str, UserRiskProfile] = {}
        self._lock = threading.RLock()

    def get_session(self, session_key: str, user_id_hash: str = "") -> SessionMemory:
        with self._lock:
            if session_key not in self._sessions:
                self._sessions[session_key] = SessionMemory(
                    session_key=session_key, user_id_hash=user_id_hash
                )
            return self._sessions[session_key]

    def get_profile(self, user_id_hash: str) -> UserRiskProfile:
        with self._lock:
            if user_id_hash not in self._profiles:
                self._profiles[user_id_hash] = UserRiskProfile(user_id_hash=user_id_hash)
            return self._profiles[user_id_hash]

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
        ev = RiskEventSummary(
            ts=time.time(),
            session_type=session_type,
            action=str(action).upper(),
            confidence=float(confidence),
            signals=list(signals or [])[:12],
            note=note[:200],
        )
        with self._lock:
            sess = self.get_session(session_key, user_id_hash)
            sess.append_event(ev)
            prof = self.get_profile(user_id_hash or "anon")
            act = ev.action
            prof.last_actions.append(act)
            prof.last_actions = prof.last_actions[-20:]
            if act == "STOP":
                prof.recent_stops += 1
            elif act == "PAUSE":
                prof.recent_pauses += 1
            elif act == "CONTINUE":
                prof.recent_continues += 1
            if prof.recent_stops >= 2 or prof.recent_pauses >= 4:
                prof.risk_tier = "high"
            elif prof.recent_stops >= 1 or prof.recent_pauses >= 2:
                prof.risk_tier = "elevated"
            else:
                prof.risk_tier = "standard"

    def context_for_manager(
        self, session_key: str, user_id_hash: str
    ) -> dict[str, Any]:
        with self._lock:
            sess = self.get_session(session_key, user_id_hash)
            prof = self.get_profile(user_id_hash or "anon")
            return {
                "session_summary": sess.controlled_summary(),
                "progressive_signals": list(sess.progressive_signals)[-12:],
                "user_risk_profile": prof.summary_text(),
                "user_risk_tier": prof.risk_tier,
            }


_STORE: SessionMemoryStore | None = None
_STORE_LOCK = threading.Lock()


def get_memory_store() -> SessionMemoryStore:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = SessionMemoryStore()
        return _STORE