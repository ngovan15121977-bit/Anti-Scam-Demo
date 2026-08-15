from typing import Literal

from pydantic import BaseModel, Field


class AssistantChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=1200)


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=800)
    history: list[AssistantChatTurn] = Field(default_factory=list, max_length=6)


class AssistantChatResponse(BaseModel):
    answer: str
    out_of_scope: bool = False
