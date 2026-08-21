"""Resolve isolated provider credentials for each specialist agent."""

from __future__ import annotations

from dataclasses import dataclass

from src.app.config import Settings, get_settings


@dataclass(frozen=True, slots=True)
class AgentProviderConfig:
    api_key: str
    base_url: str
    model: str


def _value(settings: object, name: str) -> str:
    value = getattr(settings, name, "")
    return value.strip() if isinstance(value, str) else ""


def chat_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_key=_value(current, "chat_agent_api_key") or _value(current, "groq_api_key"),
        base_url=_value(current, "chat_agent_base_url") or _value(current, "groq_base_url"),
        model=_value(current, "chat_agent_model") or _value(current, "groq_model_name"),
    )


def guardian_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_key=_value(current, "guardian_agent_api_key") or _value(current, "groq_api_key"),
        base_url=_value(current, "guardian_agent_base_url") or _value(current, "groq_base_url"),
        model=_value(current, "guardian_agent_model"),
    )


def guardian_stt_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_key=(
            _value(current, "guardian_stt_api_key")
            or _value(current, "guardian_agent_api_key")
            or _value(current, "groq_api_key")
        ),
        base_url=(
            _value(current, "guardian_stt_base_url")
            or _value(current, "guardian_agent_base_url")
            or _value(current, "groq_base_url")
        ),
        model=_value(current, "guardian_stt_model"),
    )
