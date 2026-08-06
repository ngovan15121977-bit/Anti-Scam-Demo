from sqlalchemy import Column, String, Text, ARRAY, DECIMAL, JSON, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class ScamPattern(Base):
    __tablename__ = "scam_patterns"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pattern_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    keywords = Column(ARRAY(String))
    risk_weight = Column(DECIMAL(3,2), default=0.5)
    vector_embedding = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)