"""Rule-based risk engine.

Đây là tầng nền (baseline) và đồng thời là fallback khi LLM/vector DB lỗi —
theo NFR "độ tin cậy" trong PRD. Tầng ML + RAG + LLM sẽ bọc bên ngoài tầng này
ở các sprint sau, nhưng không thay thế nó.
"""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.blacklist import BlacklistEntry
from app.models.transaction import RiskLevel, Transaction
from app.models.trusted_payee import TrustedPayee
from app.schemas.risk import AssessRequest, RiskSignal

# Ngưỡng số tiền lớn (VND) — nên hiệu chỉnh theo dữ liệu thật.
LARGE_AMOUNT_VND = 20_000_000

# Từ khóa thao túng tâm lý thường gặp trong nội dung chuyển khoản.
URGENCY_KEYWORDS = (
    "gap",
    "gấp",
    "khan cap",
    "khẩn cấp",
    "ngay lap tuc",
    "ngay lập tức",
    "cong an",
    "công an",
    "vien kiem sat",
    "viện kiểm sát",
    "phong toa",
    "phong tỏa",
    "trung thuong",
    "trúng thưởng",
    "dau tu",
    "đầu tư",
    "loi nhuan cao",
    "lợi nhuận cao",
)

_URL_PATTERN = re.compile(r"https?://|www\.|\.(?:xyz|top|tk|click|link)\b", re.IGNORECASE)

MEDIUM_THRESHOLD = 30
HIGH_THRESHOLD = 60


def _blacklist_signal(db: Session, payee_account: str) -> RiskSignal | None:
    entry = db.scalar(
        select(BlacklistEntry).where(BlacklistEntry.account_number == payee_account)
    )
    if entry is None:
        return None
    return RiskSignal(
        code="BLACKLISTED_PAYEE",
        label="Người nhận nằm trong danh sách đen",
        weight=70,
        detail=f"{entry.reason} (đã bị báo cáo {entry.report_count} lần)",
    )


def _trusted_signal(db: Session, user_id: uuid.UUID, payee_account: str) -> RiskSignal | None:
    trusted = db.scalar(
        select(TrustedPayee).where(
            TrustedPayee.user_id == user_id,
            TrustedPayee.payee_account == payee_account,
        )
    )
    if trusted is None:
        return None
    # Weight âm: giảm cảnh báo cho người nhận user đã xác nhận an toàn (5.4).
    return RiskSignal(
        code="TRUSTED_PAYEE",
        label="Người nhận đã được bạn đánh dấu an toàn",
        weight=-25,
        detail="Bạn đã từng chuyển tiền và xác nhận tin cậy người nhận này.",
    )


def _new_payee_signal(db: Session, user_id: uuid.UUID, payee_account: str) -> RiskSignal | None:
    seen = db.scalar(
        select(Transaction.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.payee_account == payee_account,
        )
        .limit(1)
    )
    if seen is not None:
        return None
    return RiskSignal(
        code="NEW_PAYEE",
        label="Lần đầu chuyển tiền cho người nhận này",
        weight=20,
        detail="Chưa có lịch sử giao dịch với số tài khoản này.",
    )


def _amount_signal(amount: int) -> RiskSignal | None:
    if amount < LARGE_AMOUNT_VND:
        return None
    return RiskSignal(
        code="LARGE_AMOUNT",
        label="Số tiền lớn",
        weight=20,
        detail=f"Giao dịch {amount:,} VND vượt ngưỡng {LARGE_AMOUNT_VND:,} VND.",
    )


def _note_signals(note: str | None) -> list[RiskSignal]:
    if not note:
        return []

    signals: list[RiskSignal] = []
    lowered = note.lower()

    matched = [kw for kw in URGENCY_KEYWORDS if kw in lowered]
    if matched:
        signals.append(
            RiskSignal(
                code="URGENCY_KEYWORD",
                label="Nội dung có dấu hiệu thao túng tâm lý",
                weight=25,
                detail=f"Phát hiện từ khóa: {', '.join(sorted(set(matched))[:5])}",
            )
        )

    if _URL_PATTERN.search(note):
        signals.append(
            RiskSignal(
                code="SUSPICIOUS_LINK",
                label="Nội dung chứa đường link",
                weight=20,
                detail="Nội dung chuyển khoản hợp lệ thường không kèm link.",
            )
        )

    return signals


def collect_signals(db: Session, user_id: uuid.UUID, req: AssessRequest) -> list[RiskSignal]:
    """Chạy toàn bộ rule và trả về các tín hiệu đã kích hoạt."""
    candidates = [
        _blacklist_signal(db, req.payee_account),
        _trusted_signal(db, user_id, req.payee_account),
        _new_payee_signal(db, user_id, req.payee_account),
        _amount_signal(req.amount),
    ]
    signals = [s for s in candidates if s is not None]
    signals.extend(_note_signals(req.note))
    return signals


def score_from_signals(signals: list[RiskSignal]) -> tuple[int, RiskLevel]:
    """Cộng weight rồi kẹp về khoảng 0-100 và quy ra 3 mức rủi ro."""
    raw = sum(s.weight for s in signals)
    score = max(0, min(100, raw))

    if score >= HIGH_THRESHOLD:
        level = RiskLevel.HIGH
    elif score >= MEDIUM_THRESHOLD:
        level = RiskLevel.MEDIUM
    else:
        level = RiskLevel.LOW
    return score, level
