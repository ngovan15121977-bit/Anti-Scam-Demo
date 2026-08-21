"""Adapters that give existing domain services a uniform agent contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.app.agents.contracts import (
    AgentCapability,
    AgentDescriptor,
    AgentId,
)
from src.app.services.scam_guardian_agent import analyze_with_guardian_agent
from src.app.services.scam_guardian_stt import transcribe_guardian_audio
from src.app.services.timi_assistant import answer_timi_question

if TYPE_CHECKING:
    from src.app.schemas.assistant import AssistantChatTurn
    from src.app.services.scam_guardian import GuardianConversationState


@dataclass(frozen=True, slots=True)
class ChatSupportTask:
    message: str
    history: list[AssistantChatTurn]


@dataclass(frozen=True, slots=True)
class ChatSupportResult:
    answer: str
    out_of_scope: bool


@dataclass(frozen=True, slots=True)
class GuardianRiskTask:
    state: GuardianConversationState
    latest_text: str


@dataclass(frozen=True, slots=True)
class GuardianAudioTask:
    audio_bytes: bytes
    mime_type: str


@dataclass(frozen=True, slots=True)
class GuardianTranscriptionResult:
    text: str


class ChatSupportAgent:
    descriptor = AgentDescriptor(
        agent_id=AgentId.CHAT_SUPPORT,
        name="Timi Chat Support Agent",
        description="Trả lời hướng dẫn sản phẩm trong phạm vi Timi.",
        capabilities=(AgentCapability.PRODUCT_CHAT,),
        api_path="/api/v1/assistant/chat",
    )

    def execute(self, payload: object) -> ChatSupportResult:
        if not isinstance(payload, ChatSupportTask):
            raise TypeError("Chat Support Agent nhận sai loại tác vụ")
        answer, out_of_scope = answer_timi_question(payload.message, payload.history)
        return ChatSupportResult(answer=answer, out_of_scope=out_of_scope)


class CallGuardianAgent:
    descriptor = AgentDescriptor(
        agent_id=AgentId.CALL_GUARDIAN,
        name="Scam Call Guardian Agent",
        description="Chuyển giọng nói thành văn bản và đánh giá dấu hiệu lừa đảo cuộc gọi.",
        capabilities=(
            AgentCapability.CALL_TRANSCRIPTION,
            AgentCapability.SCAM_RISK_DECISION,
        ),
        api_path="/api/v1/scam-guardian/ws/{session_id}",
    )

    def execute(self, payload: object) -> object:
        if isinstance(payload, GuardianRiskTask):
            return analyze_with_guardian_agent(payload.state, payload.latest_text)
        if isinstance(payload, GuardianAudioTask):
            return GuardianTranscriptionResult(
                text=transcribe_guardian_audio(payload.audio_bytes, payload.mime_type)
            )
        raise TypeError("Call Guardian Agent nhận sai loại tác vụ")

