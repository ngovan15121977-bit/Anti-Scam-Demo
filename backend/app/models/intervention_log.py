from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class InterventionLog(Base):
    __tablename__ = "intervention_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    step_number = Column(Integer, nullable=False)
    agent_message = Column(Text, nullable=False)
    user_response = Column(Text)
    risk_factors = Column(JSON)
    suggested_actions = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)