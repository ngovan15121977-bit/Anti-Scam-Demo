"""Import all active ORM models so Alembic sees one metadata registry."""

from app.db.base import Base
from app.models.audit_log import AuditLog
from app.models.blacklist import Blacklist
from app.models.compliance import DataRetentionPolicy, UserConsent
from app.models.intervention_log import InterventionLog
from app.models.model_registry import IntelligenceSource, ModelVersion
from app.models.recipient_directory import RecipientDirectory
from app.models.risk_assessment import (
    RiskLevel,
    RiskSignal,
    TransactionRiskAssessment,
    TransactionWarning,
    WarningDecision,
    WarningFeedback,
)
from app.models.scam_pattern import ScamPattern
from app.models.scam_report import ScamReport
from app.models.transaction import Transaction, TransactionEnvironment, TransactionStatus
from app.models.trusted_recipient import TrustedRecipient
from app.models.user import User, UserRole

__all__ = [
    "AuditLog",
    "Base",
    "Blacklist",
    "DataRetentionPolicy",
    "IntelligenceSource",
    "InterventionLog",
    "ModelVersion",
    "RiskLevel",
    "RiskSignal",
    "RecipientDirectory",
    "ScamPattern",
    "ScamReport",
    "Transaction",
    "TransactionEnvironment",
    "TransactionRiskAssessment",
    "TransactionStatus",
    "TransactionWarning",
    "TrustedRecipient",
    "User",
    "UserConsent",
    "UserRole",
    "WarningDecision",
    "WarningFeedback",
]
