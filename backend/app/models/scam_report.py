from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class ScamReport(Base):
    __tablename__ = "scam_reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    report_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), default="open")
    admin_note = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)