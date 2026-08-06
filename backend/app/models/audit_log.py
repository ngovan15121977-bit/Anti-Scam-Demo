from sqlalchemy import Column, String, DateTime, JSON, Text
from sqlalchemy.dialects.postgresql import UUID, INET
import uuid
from datetime import datetime
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_name = Column(String(50), nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=False)
    action = Column(String(20), nullable=False)
    old_data = Column(JSON)
    new_data = Column(JSON)
    performed_by = Column(UUID(as_uuid=True))
    performed_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    ip_address = Column(INET)
    user_agent = Column(Text)