"""Sinh lời giải thích + khuyến nghị + câu hỏi xác minh.

Bản hiện tại là template deterministic, chỉ diễn đạt lại các tín hiệu đã kích
hoạt — đúng nguyên tắc "giải thích dựa trên dữ liệu đối chiếu thực tế, không tự
suy diễn". Ở sprint sau, LangGraph agent sẽ thay hàm explain() bằng LLM + RAG,
nhưng vẫn nhận đúng list[RiskSignal] này làm input.
"""

from app.models.transaction import RiskLevel
from app.schemas.risk import RiskSignal

_LEVEL_INTRO = {
    RiskLevel.LOW: "Giao dịch này không có dấu hiệu bất thường.",
    RiskLevel.MEDIUM: "Giao dịch này có một số dấu hiệu cần bạn lưu ý.",
    RiskLevel.HIGH: "Giao dịch này có nhiều dấu hiệu rủi ro cao của lừa đảo.",
}

_LEVEL_RECOMMENDATION = {
    RiskLevel.LOW: "Bạn có thể tiếp tục giao dịch.",
    RiskLevel.MEDIUM: (
        "Hãy xác minh lại người nhận qua một kênh liên lạc khác "
        "(gọi điện trực tiếp) trước khi chuyển tiền."
    ),
    RiskLevel.HIGH: (
        "Chúng tôi khuyến nghị bạn TẠM DỪNG giao dịch và xác minh trực tiếp với "
        "người nhận qua số điện thoại bạn đã biết. Quyết định cuối cùng vẫn "
        "thuộc về bạn."
    ),
}

# Câu hỏi xác minh cho luồng HITL khi rủi ro cao (yêu cầu 5.3: 2-3 câu).
_HIGH_RISK_QUESTIONS = [
    "Bạn có gọi điện trực tiếp cho người nhận để xác nhận yêu cầu chuyển tiền này không?",
    "Người nhận có yêu cầu bạn chuyển tiền gấp hoặc giữ bí mật với người khác không?",
    "Bạn có chắc số tài khoản này là của đúng người bạn định chuyển tiền?",
]

_MEDIUM_RISK_QUESTIONS = [
    "Bạn đã từng giao dịch với người nhận này trước đây chưa?",
]


def explain(risk_level: RiskLevel, signals: list[RiskSignal]) -> str:
    """Ghép lời giải thích từ các tín hiệu thực tế đã kích hoạt."""
    lines = [_LEVEL_INTRO[risk_level]]

    # Chỉ liệt kê tín hiệu làm tăng rủi ro; tín hiệu giảm nêu riêng.
    risk_increasing = [s for s in signals if s.weight > 0]
    risk_reducing = [s for s in signals if s.weight < 0]

    if risk_increasing:
        lines.append("\nLý do cảnh báo:")
        lines.extend(
            f"- {s.label}" + (f": {s.detail}" if s.detail else "") for s in risk_increasing
        )

    if risk_reducing:
        lines.append("\nYếu tố làm giảm rủi ro:")
        lines.extend(
            f"- {s.label}" + (f": {s.detail}" if s.detail else "") for s in risk_reducing
        )

    return "\n".join(lines)


def recommend(risk_level: RiskLevel) -> str:
    return _LEVEL_RECOMMENDATION[risk_level]


def verification_questions(risk_level: RiskLevel) -> list[str]:
    if risk_level is RiskLevel.HIGH:
        return list(_HIGH_RISK_QUESTIONS)
    if risk_level is RiskLevel.MEDIUM:
        return list(_MEDIUM_RISK_QUESTIONS)
    return []
