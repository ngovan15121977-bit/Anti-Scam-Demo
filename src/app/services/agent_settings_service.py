"""Load / merge / persist agent config overrides (DB > env defaults)."""

from __future__ import annotations

import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.config import Settings, get_settings
from src.app.models.agent_setting import AgentSetting
from src.app.schemas.agent_admin import (
    AGENT_IDS,
    AGENT_LABELS,
    AgentCardOut,
    AgentId,
    AgentUpdateIn,
    ChatConfig,
    GuardianConfig,
    ManagerConfig,
    NavigatorConfig,
    PolicySettingsOut,
    PolicySettingsUpdate,
    SttConfig,
)
from src.app.services.audit import add_audit_log

POLICY_AGENT_ID = "_policy"


def _api_key_configured(*values: str) -> bool:
    return any(bool((v or "").strip()) for v in values)


def _defaults_from_settings(settings: Settings) -> dict[AgentId, dict[str, Any]]:
    return {
        "guardian": GuardianConfig(
            enabled=settings.guardian_agent_enabled,
            model=settings.guardian_agent_model or "llama-3.1-8b-instant",
            prompt_version="0.3",
            temperature=min(max(settings.llm_temperature, 0.0), 1.0),
            max_completion_tokens=900,
            min_interval_seconds=settings.guardian_agent_min_interval_seconds,
        ).model_dump(),
        "stt": SttConfig(
            enabled=settings.guardian_stt_enabled,
            model=settings.guardian_stt_model or "whisper-large-v3",
        ).model_dump(),
        "manager": ManagerConfig(
            enabled=settings.risk_manager_enabled,
            use_llm=settings.risk_manager_use_llm,
            phase3=settings.risk_manager_phase3,
            prompt_version=settings.manager_prompt_version or "0.2",
            model=settings.groq_model_name or "openai/gpt-oss-20b",
            temperature=0.1,
            max_completion_tokens=1500,
        ).model_dump(),
        "chat": ChatConfig(
            enabled=True,
            model=settings.chat_agent_model or settings.groq_model_name or "openai/gpt-oss-20b",
            temperature=settings.llm_temperature,
            max_completion_tokens=settings.assistant_chat_max_completion_tokens,
            history_limit=settings.assistant_chat_history_limit,
            context_exchanges=settings.assistant_chat_context_exchanges,
            retention_days=settings.assistant_chat_retention_days,
            cache_version=settings.assistant_chat_cache_version,
        ).model_dump(),
        "navigator": NavigatorConfig(
            enabled=settings.task_navigator_agent_enabled,
            model=settings.task_navigator_agent_model
            or settings.groq_model_name
            or "openai/gpt-oss-20b",
            max_completion_tokens=settings.task_navigator_agent_max_completion_tokens,
        ).model_dump(),
    }


def _key_flags(settings: Settings) -> dict[AgentId, bool]:
    return {
        "guardian": _api_key_configured(
            settings.guardian_agent_api_key, settings.groq_api_key
        ),
        "stt": _api_key_configured(
            settings.guardian_stt_api_key,
            settings.guardian_agent_api_key,
            settings.groq_api_key,
        ),
        "manager": _api_key_configured(settings.groq_api_key),
        "chat": _api_key_configured(settings.chat_agent_api_key, settings.groq_api_key),
        "navigator": _api_key_configured(
            settings.task_navigator_agent_api_key, settings.groq_api_key
        ),
    }


def _discover_prompt_versions(project_root: Path) -> dict[str, list[str]]:
    prompts_dir = project_root / "prompts"
    result: dict[str, list[str]] = {"guardian": [], "manager": []}
    if not prompts_dir.is_dir():
        return {"guardian": ["0.1", "0.2", "0.3"], "manager": ["0.1", "0.2"]}
    for path in sorted(prompts_dir.glob("guardian_v*.yaml")):
        ver = path.stem.replace("guardian_v", "")
        if ver:
            result["guardian"].append(ver)
    for path in sorted(prompts_dir.glob("manager_v*.yaml")):
        ver = path.stem.replace("manager_v", "")
        if ver:
            result["manager"].append(ver)
    if not result["guardian"]:
        result["guardian"] = ["0.1", "0.2", "0.3"]
    if not result["manager"]:
        result["manager"] = ["0.1", "0.2"]
    return result


def _get_row(db: Session, agent_id: str) -> AgentSetting | None:
    return db.scalar(select(AgentSetting).where(AgentSetting.agent_id == agent_id))


def get_merged_config(db: Session, agent_id: AgentId, settings: Settings | None = None) -> dict[str, Any]:
    current = settings or get_settings()
    base = deepcopy(_defaults_from_settings(current)[agent_id])
    row = _get_row(db, agent_id)
    if row and isinstance(row.config_json, dict):
        base.update({k: v for k, v in row.config_json.items() if v is not None})
    return base


def list_agents_config(db: Session, settings: Settings | None = None) -> tuple[list[AgentCardOut], dict[str, list[str]]]:
    current = settings or get_settings()
    key_flags = _key_flags(current)
    cards: list[AgentCardOut] = []
    for agent_id in AGENT_IDS:
        cfg = get_merged_config(db, agent_id, current)
        row = _get_row(db, agent_id)
        cards.append(
            AgentCardOut(
                agent_id=agent_id,
                label=AGENT_LABELS[agent_id],
                enabled=bool(cfg.get("enabled", True)),
                model=cfg.get("model"),
                prompt_version=cfg.get("prompt_version"),
                api_key_configured=key_flags[agent_id],
                updated_at=row.updated_at if row else None,
                note=row.note if row else None,
                config=cfg,
            )
        )
    return cards, _discover_prompt_versions(current.project_root)


def update_agent_config(
    db: Session,
    *,
    agent_id: AgentId,
    payload: AgentUpdateIn,
    actor_id: uuid.UUID | None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    current = settings or get_settings()
    before = get_merged_config(db, agent_id, current)
    patch = payload.model_dump(exclude_none=True)
    note = patch.pop("note", None)
    after = {**before, **patch}

    # Validate with the right schema
    validators = {
        "guardian": GuardianConfig,
        "stt": SttConfig,
        "manager": ManagerConfig,
        "chat": ChatConfig,
        "navigator": NavigatorConfig,
    }
    validated = validators[agent_id].model_validate(after).model_dump()

    row = _get_row(db, agent_id)
    if row is None:
        row = AgentSetting(agent_id=agent_id, config_json=validated, note=note, updated_by=actor_id)
        db.add(row)
    else:
        row.config_json = validated
        if note is not None:
            row.note = note
        row.updated_by = actor_id

    add_audit_log(
        db,
        action="admin.agent_config_update",
        actor_id=actor_id,
        resource_type="agent_setting",
        resource_id=row.id if row.id else None,
        metadata={
            "agent_id": agent_id,
            "before": before,
            "after": validated,
            "fields": list(patch.keys()),
        },
    )
    db.commit()
    db.refresh(row)
    return validated


def reset_agent_config(
    db: Session,
    *,
    agent_id: AgentId,
    actor_id: uuid.UUID | None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    current = settings or get_settings()
    defaults = _defaults_from_settings(current)[agent_id]
    row = _get_row(db, agent_id)
    if row is not None:
        before = dict(row.config_json or {})
        db.delete(row)
        add_audit_log(
            db,
            action="admin.agent_config_reset",
            actor_id=actor_id,
            resource_type="agent_setting",
            resource_id=None,
            metadata={"agent_id": agent_id, "before": before, "after": defaults},
        )
        db.commit()
    return defaults


def get_policy_settings(db: Session) -> PolicySettingsOut:
    row = _get_row(db, POLICY_AGENT_ID)
    base = PolicySettingsOut()
    if row and isinstance(row.config_json, dict):
        return PolicySettingsOut(**{**base.model_dump(), **row.config_json})
    return base


def update_policy_settings(
    db: Session,
    *,
    payload: PolicySettingsUpdate,
    actor_id: uuid.UUID | None,
) -> PolicySettingsOut:
    before = get_policy_settings(db).model_dump()
    patch = payload.model_dump(exclude_none=True)
    after = PolicySettingsOut(**{**before, **patch}).model_dump()
    row = _get_row(db, POLICY_AGENT_ID)
    if row is None:
        row = AgentSetting(agent_id=POLICY_AGENT_ID, config_json=after, updated_by=actor_id)
        db.add(row)
    else:
        row.config_json = after
        row.updated_by = actor_id
    add_audit_log(
        db,
        action="admin.policy_settings_update",
        actor_id=actor_id,
        resource_type="agent_setting",
        resource_id=row.id if getattr(row, "id", None) else None,
        metadata={"before": before, "after": after},
    )
    db.commit()
    return PolicySettingsOut(**after)
