# Import Base trước
from app.database import Base

# Import User TRƯỚC TẤT CẢ các model có Foreign Key đến nó
from app.models.user import User

# Sau đó import các model còn lại
from app.models.transaction import Transaction
from app.models.blacklist import Blacklist
from app.models.scam_pattern import ScamPattern
from app.models.trusted_recipient import TrustedRecipient
from app.models.audit_log import AuditLog
from app.models.intervention_log import InterventionLog
from app.models.scam_report import ScamReport