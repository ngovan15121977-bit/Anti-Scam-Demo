import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RiskLevel = Literal["safe", "low", "medium", "high"]
SignalSeverity = Literal["info", "low", "medium", "high"]
WarningDecision = Literal["proceeded", "cancelled"]
InterventionAction = Literal[
    "start", "verify", "continue", "trust_recipient", "cancel", "proceed"
]


class AssessRequest(BaseModel):
    """Input cho một lệnh chuyển tiền trước khi user ra quyết định."""

    payee_account: str = Field(..., min_length=4, max_length=64)
    # Server fills this from the signed lookup token, never from manual input.
    payee_name: str = Field(default="", max_length=255)
    bank_code: str | None = Field(default=None, max_length=100)
    recipient_lookup_token: str = Field(..., min_length=1, max_length=4096)
    amount: int = Field(..., gt=0, le=10_000_000_000)
    note: str | None = Field(default=None, max_length=500)
    currency: str = Field(default="VND", min_length=3, max_length=3)


class RiskSignalOut(BaseModel):
    signal_type: str
    severity: SignalSeverity
    score: float | None = None
    explanation: str
    evidence: dict[str, object] = Field(default_factory=dict)


class WarningOut(BaseModel):
    id: uuid.UUID
    warning_level: Literal["medium", "high"]
    title: str
    message: str
    transparency_reason: str
    displayed_at: datetime
    countdown_seconds: int


class AssessResponse(BaseModel):
    transaction_id: uuid.UUID
    assessment_id: uuid.UUID
    risk_score: float = Field(..., ge=0, le=1)
    risk_level: RiskLevel
    signals: list[RiskSignalOut] = []
    explanation: str
    recommendation: str
    should_warn: bool
    warning: WarningOut | None = None
    requires_user_decision: bool = True
    intervention: "InterventionOut | None" = None


class DecisionRequest(BaseModel):
    decision: WarningDecision
    verification_confirmed: bool | None = None
    verification_method: str | None = Field(default=None, max_length=50)
    verification_answers: list[str] = Field(default_factory=list, max_length=3)
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")
    face_verification_confirmed: bool = False
    face_verification_token: str | None = Field(default=None, max_length=4096)


class DecisionResponse(BaseModel):
    transaction_id: uuid.UUID
    transaction_status: Literal["completed", "cancelled", "failed"]
    warning_id: uuid.UUID | None = None
    decided_at: datetime


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payee_account: str
    payee_name: str
    bank_code: str | None
    amount: int
    currency: str
    transaction_status: str
    created_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    risk_level: str | None = None


class TrustedRecipientCreate(BaseModel):
    account_number: str = Field(..., min_length=4, max_length=64)
    recipient_name: str = Field(..., min_length=1, max_length=255)
    bank_code: str | None = Field(default=None, max_length=100)


class WarningFeedbackCreate(BaseModel):
    feedback_type: Literal[
        "helpful", "false_positive", "confirmed_scam", "not_helpful", "unsure"
    ]
    comment: str | None = Field(default=None, max_length=2000)


class InterventionRequest(BaseModel):
    action: InterventionAction = "start"
    response: str | None = Field(default=None, max_length=2000)


class InterventionOut(BaseModel):
    transaction_id: uuid.UUID
    warning_id: uuid.UUID | None = None
    step: int
    total_steps: int
    node_name: str
    message: str
    question: str | None = None
    suggested_actions: list[str] = Field(default_factory=list)
    risk_factors: list[str] = Field(default_factory=list)
    decision_ready: bool = False
    can_proceed: bool = False
