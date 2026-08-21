from types import SimpleNamespace

from src.app.services.agent_provider_config import (
    chat_provider_config,
    guardian_provider_config,
    guardian_stt_provider_config,
)


def test_specialists_prefer_their_own_provider_credentials() -> None:
    settings = SimpleNamespace(
        groq_api_key="legacy-key",
        groq_base_url="https://legacy.test/v1",
        groq_model_name="legacy-chat",
        chat_agent_api_key="chat-key",
        chat_agent_base_url="https://chat.test/v1",
        chat_agent_model="small-chat",
        guardian_agent_api_key="guardian-key",
        guardian_agent_base_url="https://guardian.test/v1",
        guardian_agent_model="guardian-model",
        guardian_stt_api_key="stt-key",
        guardian_stt_base_url="https://stt.test/v1",
        guardian_stt_model="whisper-model",
    )

    assert chat_provider_config(settings).api_key == "chat-key"
    assert chat_provider_config(settings).model == "small-chat"
    assert guardian_provider_config(settings).api_key == "guardian-key"
    assert guardian_stt_provider_config(settings).api_key == "stt-key"


def test_specialists_remain_compatible_with_legacy_groq_config() -> None:
    settings = SimpleNamespace(
        groq_api_key="legacy-key",
        groq_base_url="https://legacy.test/v1",
        groq_model_name="legacy-chat",
        guardian_agent_model="guardian-model",
        guardian_stt_model="whisper-model",
    )

    assert chat_provider_config(settings).api_key == "legacy-key"
    assert guardian_provider_config(settings).base_url == "https://legacy.test/v1"
    assert guardian_stt_provider_config(settings).api_key == "legacy-key"
