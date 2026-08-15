import logging

from fastapi import APIRouter, Depends, HTTPException, status

from src.app.core.deps import get_current_user
from src.app.models.user import User
from src.app.schemas.assistant import AssistantChatRequest, AssistantChatResponse
from src.app.services.timi_assistant import answer_timi_question

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
        answer, out_of_scope = answer_timi_question(payload.message, payload.history)
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
    return AssistantChatResponse(answer=answer, out_of_scope=out_of_scope)
