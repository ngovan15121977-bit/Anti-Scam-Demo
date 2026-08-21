import logging

from fastapi import APIRouter, Depends, HTTPException, status

from src.app.agents import (
    AgentId,
    ChatSupportResult,
    ChatSupportTask,
    get_multi_agent_supervisor,
)
from src.app.core.deps import get_current_user
from src.app.models.user import User
from src.app.schemas.assistant import AssistantChatRequest, AssistantChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantChatResponse)
def chat_with_timi(
    payload: AssistantChatRequest,
    current_user: User = Depends(get_current_user),
) -> AssistantChatResponse:
    """Authenticated, scope-limited support chat with no account-data access."""
    del current_user
    try:
        result = get_multi_agent_supervisor().dispatch(
            AgentId.CHAT_SUPPORT,
            ChatSupportTask(message=payload.message, history=payload.history),
        )
        if not isinstance(result, ChatSupportResult):
            raise TypeError("Chat Support Agent trả về kết quả không hợp lệ")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trợ lý Timi chưa được cấu hình API. Vui lòng thử lại sau.",
        ) from None
    except Exception:
        logger.exception("Timi assistant request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timi chưa thể trả lời lúc này. Vui lòng thử lại sau.",
        ) from None
    return AssistantChatResponse(
        answer=result.answer,
        out_of_scope=result.out_of_scope,
    )
