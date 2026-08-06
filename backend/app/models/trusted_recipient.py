from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class TrustedRecipient(Base):
    __tablename__ = "trusted_recipients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_name = Column(String(100), nullable=False)
    account_number = Column(String(100), nullable=False)
    bank_code = Column(String(20))
    trusted_at = Column(DateTime(timezone=True), default=datetime.utcnow)