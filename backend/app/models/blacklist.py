from sqlalchemy import Column, String, DECIMAL, Boolean, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class Blacklist(Base):
    __tablename__ = "blacklist"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(20), nullable=False)
    entity_value = Column(String(255), nullable=False)
    source = Column(String(50), nullable=False)
    risk_score = Column(DECIMAL(3,2), default=0.95)
    evidence = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)