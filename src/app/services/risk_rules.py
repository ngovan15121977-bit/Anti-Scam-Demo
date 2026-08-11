"""Deterministic risk rules used before any ML or LangGraph enrichment.

The functions return structured candidates. The API persists those candidates to
``risk_signals`` so a later model/rule version never overwrites past evidence.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.models.blacklist import Blacklist
from src.app.models.risk_assessment import RiskLevel
from src.app.models.scam_pattern import ScamPattern
from src.app.models.transaction import Transaction, TransactionStatus
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.schemas.risk import AssessRequest
from src.app.services.bank_normalization import normalize_bank_name

LARGE_AMOUNT_VND = 20_000_000
RULES_VERSION = "rules-2026-08-07"

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

SUSPICIOUS_URL_MARKERS = ("http://", "https://", "www.", ".xyz", ".top", ".click")


@dataclass(frozen=True)
class RiskSignalCandidate:
    signal_type: str
    severity: str
    score: float
    explanation: str
    matched_blacklist_id: object | None = None
    matched_pattern_id: object | None = None
    evidence: dict | None = None


def _mask_account(account: str) -> str:
    compact = account.replace(" ", "").strip()
    return f"***{compact[-4:]}" if len(compact) > 4 else "[masked]"


def _blacklist_signal(db: Session, request: AssessRequest) -> RiskSignalCandidate | None:
    """Only an exact account + bank match creates a blacklist signal."""
    if not request.bank_code:
        return None

    account = request.payee_account.replace(" ", "").strip()
    expected_bank = normalize_bank_name(request.bank_code)
    entries = db.scalars(
        select(Blacklist).where(
            Blacklist.is_active.is_(True),
            Blacklist.entity_type == "account",
            Blacklist.entity_value == account,
        )
    ).all()
    entry = next(
        (candidate for candidate in entries if normalize_bank_name(candidate.bank) == expected_bank),
        None,
    )
    if entry is None:
        return None

    score = max(0.75, min(1.0, float(entry.risk_score)))
    return RiskSignalCandidate(
        signal_type="blacklist_exact_match",
        severity="high",
        score=score,
        explanation=(
            f"Tài khoản {_mask_account(account)} khớp chính xác với dữ liệu cần "
            "thận trọng của nguồn đối chiếu."
        ),
        matched_blacklist_id=entry.id,
        evidence={"source": entry.source, "match": "account_and_bank"},
    )


def _trusted_recipient_signal(
    db: Session, user_id: object, request: AssessRequest
) -> RiskSignalCandidate | None:
    query = select(TrustedRecipient).where(
        TrustedRecipient.user_id == user_id,
        TrustedRecipient.account_number == request.payee_account.replace(" ", "").strip(),
    )
    if request.bank_code:
        query = query.where(TrustedRecipient.bank_code == request.bank_code)
    recipient = db.scalar(query)
    if recipient is None:
        return None
    return RiskSignalCandidate(
        signal_type="trusted_recipient",
        severity="info",
        score=-0.25,
        explanation="Người nhận đã được bạn đánh dấu là tin cậy.",
    )


def _new_payee_signal(db: Session, user_id: object, request: AssessRequest) -> RiskSignalCandidate | None:
    query = select(Transaction.id).where(
        Transaction.user_id == user_id,
        Transaction.payee_account == request.payee_account.replace(" ", "").strip(),
        Transaction.transaction_status == TransactionStatus.COMPLETED,
    )
    if request.bank_code:
        query = query.where(Transaction.bank_code == request.bank_code)
    if db.scalar(query.limit(1)) is not None:
        return None
    return RiskSignalCandidate(
        signal_type="new_payee",
        severity="low",
        score=0.20,
        explanation="Đây là lần đầu bạn hoàn tất giao dịch với người nhận này.",
    )


def _amount_signal(amount: int) -> RiskSignalCandidate | None:
    if amount < LARGE_AMOUNT_VND:
        return None
    return RiskSignalCandidate(
        signal_type="unusual_amount",
        severity="medium",
        score=0.20,
        explanation=(
            f"Số tiền {amount:,.0f} VND vượt ngưỡng cảnh báo "
            f"{LARGE_AMOUNT_VND:,.0f} VND."
        ),
    )


def _note_signals(note: str | None) -> list[RiskSignalCandidate]:
    if not note:
        return []

    lowered = note.lower()
    signals: list[RiskSignalCandidate] = []
    matched = sorted({keyword for keyword in URGENCY_KEYWORDS if keyword in lowered})
    if matched:
        signals.append(
            RiskSignalCandidate(
                signal_type="suspicious_note",
                severity="medium",
                score=0.25,
                explanation="Nội dung có từ khóa thường được dùng để tạo áp lực chuyển tiền gấp.",
                evidence={"matched_keyword_count": len(matched)},
            )
        )
    if any(marker in lowered for marker in SUSPICIOUS_URL_MARKERS):
        signals.append(
            RiskSignalCandidate(
                signal_type="suspicious_link",
                severity="medium",
                score=0.20,
                explanation="Nội dung chuyển khoản có chứa đường dẫn cần được xác minh thêm.",
            )
        )
    return signals


def _pattern_signals(db: Session, note: str | None) -> list[RiskSignalCandidate]:
    if not note:
        return []
    lowered = note.lower()
    matches: list[RiskSignalCandidate] = []
    patterns = db.scalars(select(ScamPattern).where(ScamPattern.is_active.is_(True))).all()
    for pattern in patterns:
        keywords = pattern.keywords or []
        if not any(keyword.lower() in lowered for keyword in keywords):
            continue
        score = min(0.40, max(0.10, float(pattern.risk_weight)))
        matches.append(
            RiskSignalCandidate(
                signal_type="scam_pattern_match",
                severity="high" if score >= 0.30 else "medium",
                score=score,
                explanation=f"Nội dung khớp với mẫu lừa đảo: {pattern.pattern_name}.",
                matched_pattern_id=pattern.id,
                evidence={"pattern_name": pattern.pattern_name},
            )
        )
    return matches[:3]


def collect_signals(
    db: Session, user_id: object, request: AssessRequest
) -> list[RiskSignalCandidate]:
    candidates = [
        _blacklist_signal(db, request),
        _trusted_recipient_signal(db, user_id, request),
        _new_payee_signal(db, user_id, request),
        _amount_signal(request.amount),
    ]
    signals = [candidate for candidate in candidates if candidate is not None]
    signals.extend(_note_signals(request.note))
    signals.extend(_pattern_signals(db, request.note))
    return signals


def score_from_signals(signals: list[RiskSignalCandidate]) -> tuple[float, str]:
    positive = [signal for signal in signals if signal.score > 0]
    has_exact_blacklist = any(signal.signal_type == "blacklist_exact_match" for signal in positive)
    trusted = any(signal.signal_type == "trusted_recipient" for signal in signals)
    score = sum(signal.score for signal in signals)
    if trusted and not has_exact_blacklist:
        score = max(0.0, score - 0.15)

    strong_signal_count = sum(
        1 for signal in positive
        if signal.severity == "high"
        or signal.signal_type in {"suspicious_note", "suspicious_link"}
    )
    if not has_exact_blacklist and strong_signal_count < 2 and score >= 0.60:
        score = 0.59
    score = round(max(0.0, min(1.0, score)), 4)
    if score == 0:
        return score, RiskLevel.SAFE
    if score < 0.30:
        return score, RiskLevel.LOW
    if score < 0.60:
        return score, RiskLevel.MEDIUM
    return score, RiskLevel.HIGH


def build_explanation(level: str, signals: list[RiskSignalCandidate]) -> str:
    risk_signals = [signal for signal in signals if signal.score > 0]
    safeguards = [signal for signal in signals if signal.score < 0]
    if not risk_signals:
        return "Không phát hiện dấu hiệu rủi ro đáng kể từ các rule hiện có."

    lines = ["Các dấu hiệu được hệ thống đối chiếu:"]
    lines.extend(f"- {signal.explanation}" for signal in risk_signals)
    if safeguards:
        lines.append("Yếu tố làm giảm cảnh báo:")
        lines.extend(f"- {signal.explanation}" for signal in safeguards)
    return "\n".join(lines)


def recommendation(level: str) -> str:
    if level == RiskLevel.HIGH:
        return "Khuyến nghị tạm dừng và xác minh người nhận qua một kênh liên lạc độc lập."
    if level == RiskLevel.MEDIUM:
        return "Hãy kiểm tra lại người nhận trước khi tiếp tục giao dịch."
    return "Bạn vẫn là người quyết định cuối cùng cho giao dịch này."


def verification_questions(level: str) -> list[str]:
    if level == RiskLevel.HIGH:
        return [
            "Bạn đã gọi trực tiếp cho người nhận để xác nhận yêu cầu này chưa?",
            "Bạn có bị yêu cầu chuyển gấp hoặc giữ bí mật không?",
            "Bạn đã đối chiếu lại số tài khoản và ngân hàng chưa?",
        ]
    if level == RiskLevel.MEDIUM:
        return ["Bạn đã xác minh lại thông tin người nhận qua kênh độc lập chưa?"]
    return []
