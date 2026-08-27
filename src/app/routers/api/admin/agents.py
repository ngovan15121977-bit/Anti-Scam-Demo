"""Admin APIs for managing the five specialist agent configs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.app.core.deps import require_admin
from src.app.db.session import get_db
from src.app.models.user import User
from src.app.schemas.agent_admin import (
    AGENT_IDS,
    AGENT_LABELS,
    AgentId,
    AgentUpdateIn,
    AgentUpdateOut,
    AgentsConfigOut,
    PolicySettingsOut,
    PolicySettingsUpdate,
)
from src.app.services.agent_settings_service import (
    get_policy_settings,
    list_agents_config,
    reset_agent_config,
    update_agent_config,
    update_policy_settings,
)

router = APIRouter(prefix="/admin/agents", tags=["admin-agents"], dependencies=[Depends(require_admin)])


def _parse_agent_id(agent_id: str) -> AgentId:
    if agent_id not in AGENT_IDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent không hợp lệ. Cho phép: {', '.join(AGENT_IDS)}",
        )
    return agent_id  # type: ignore[return-value]


@router.get("/config", response_model=AgentsConfigOut)
def get_all_agents_config(db: Session = Depends(get_db)) -> AgentsConfigOut:
    cards, prompt_versions = list_agents_config(db)
    return AgentsConfigOut(agents=cards, prompt_versions=prompt_versions)


@router.put("/{agent_id}", response_model=AgentUpdateOut)
def put_agent_config(
    agent_id: str,
    payload: AgentUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AgentUpdateOut:
    aid = _parse_agent_id(agent_id)
    config = update_agent_config(db, agent_id=aid, payload=payload, actor_id=admin.id)
    return AgentUpdateOut(agent_id=aid, label=AGENT_LABELS[aid], config=config)


@router.post("/{agent_id}/reset", response_model=AgentUpdateOut)
def post_reset_agent(
    agent_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AgentUpdateOut:
    aid = _parse_agent_id(agent_id)
    config = reset_agent_config(db, agent_id=aid, actor_id=admin.id)
    return AgentUpdateOut(
        agent_id=aid,
        label=AGENT_LABELS[aid],
        config=config,
        message="Đã khôi phục cấu hình mặc định từ env/Settings",
    )


@router.get("/policy", response_model=PolicySettingsOut)
def get_policy(db: Session = Depends(get_db)) -> PolicySettingsOut:
    return get_policy_settings(db)


@router.put("/policy", response_model=PolicySettingsOut)
def put_policy(
    payload: PolicySettingsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PolicySettingsOut:
    return update_policy_settings(db, payload=payload, actor_id=admin.id)
