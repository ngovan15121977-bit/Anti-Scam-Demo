import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.transaction import RiskLevel, UserDecision


class AssessRequest(BaseModel):
    """Yêu cầu đánh giá rủi ro trước khi người dùng xác nhận chuyển tiền."""

    payee_account: str = Field(..., min_length=4, max_length=64)
    payee_name: str = Field(..., min_length=1, max_length=255)
    bank_code: str | None = Field(default=None, max_length=32)
    amount: int = Field(..., gt=0, le=10_000_000_000)

    # Nội dung chuyển khoản là input không tin cậy — phải sanitize trước khi
    # đưa vào prompt LLM để chống prompt injection (NFR mục 6).
    note: str | None = Field(default=None, max_length=500)


class RiskSignal(BaseModel):
    """Một tín hiệu rủi ro đã kích hoạt. Là cơ sở để giải thích, không hộp đen."""

    code: str
    label: str
    weight: int
    detail: str | None = None


class AssessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: uuid.UUID
    risk_score: int = Field(..., ge=0, le=100)
    risk_level: RiskLevel
    signals: list[RiskSignal] = []
    explanation: str = ""
    recommendation: str = ""

    # Câu hỏi xác minh cho luồng HITL khi rủi ro cao (2-3 câu).
    verification_questions: list[str] = []

    # Luôn True: agent không bao giờ tự chặn giao dịch, người dùng quyết định.
    requires_user_decision: bool = True


class DecisionRequest(BaseModel):
    """Ghi lại quyết định cuối cùng của người dùng — bắt buộc cho audit HITL."""

    decision: UserDecision
    verification_answers: list[str] = []


class TransactionOut(BaseModel):
    """Một dòng trong lịch sử giao dịch."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payee_account: str
    payee_name: str
    amount: int
    note: str | None
    risk_score: int
    risk_level: RiskLevel
    user_decision: UserDecision
    created_at: datetime
