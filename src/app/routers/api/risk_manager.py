"""Bank Risk Manager — HITL feedback + light status (Phase 3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.models.user import User

router = APIRouter(prefix="/risk-manager", tags=["risk-manager"])


class HitlFeedbackBody(BaseModel):
    session_key: str = Field(..., min_length=1, max_length=128)
    manager_action: str = Field(..., min_length=1, max_length=32)
    manager_confidence: float = Field(0.0, ge=0.0, le=1.0)
    human_action: str = Field(..., min_length=1, max_length=32)
    agreed: bool | None = None
    note: str = Field("", max_length=300)


class HitlFeedbackResponse(BaseModel):
    ok: bool
    hint: str = ""
    samples: int = 0
    agree_rate: float | None = None


@router.post("/hitl-feedback", response_model=HitlFeedbackResponse)
def post_hitl_feedback(
    body: HitlFeedbackBody,
    current_user: User = Depends(get_current_user),
) -> HitlFeedbackResponse:
    """Record human decision vs Manager recommendation (no auto-policy change)."""
    from src.app.services.risk_manager.phase3.feedback import (
        load_feedback_hints,
        record_hitl_feedback,
    )

    record_hitl_feedback(
        user_id_hash=str(current_user.id),
        session_key=body.session_key,
        manager_action=body.manager_action,
        manager_confidence=body.manager_confidence,
        human_action=body.human_action,
        agreed=body.agreed,
        note=body.note,
    )
    hints = load_feedback_hints()
    return HitlFeedbackResponse(
        ok=True,
        hint=str(hints.get("hint") or ""),
        samples=int(hints.get("samples") or 0),
        agree_rate=hints.get("agree_rate"),
    )


@router.get("/status")
def risk_manager_status(
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Feature flags + memory/RAG availability (no secrets)."""
    settings = get_settings()
    from src.app.services.risk_manager.phase3.feedback import load_feedback_hints
    from src.app.services.risk_manager.phase3.memory import get_memory_store

    hints = load_feedback_hints()
    store = get_memory_store()
    uid = str(current_user.id)
    prof = store.get_profile(uid)
    try:
        from src.app.services.risk_manager.metrics import snapshot as metrics_snapshot
        metrics = metrics_snapshot()
    except Exception:
        metrics = {}

    return {
        "risk_manager_enabled": bool(settings.risk_manager_enabled),
        "risk_manager_use_llm": bool(settings.risk_manager_use_llm),
        "risk_manager_phase3": bool(getattr(settings, "risk_manager_phase3", True)),
        "manager_prompt_version": str(getattr(settings, "manager_prompt_version", "0.2")),
        "user_risk_tier": prof.risk_tier,
        "user_profile_summary": prof.summary_text(),
        "hitl_feedback": {
            "samples": hints.get("samples"),
            "agree_rate": hints.get("agree_rate"),
            "hint": hints.get("hint"),
        },
        "metrics": metrics,
    }
