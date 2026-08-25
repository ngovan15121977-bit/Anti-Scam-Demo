"""Light retrieval for Manager context — keyword over static VN scam patterns.

Phase 3 v0: offline seed (no network). Phase 4: plug pgvector / blacklist DB.
"""

from __future__ import annotations

from typing import Any

_SEED: list[dict[str, Any]] = [
    {
        "id": "otp_bank_impersonation",
        "keywords": ["otp", "ngân hàng", "mã xác thực", "bảo mật", "otp_request"],
        "title": "Giả danh ngân hàng — đòi OTP",
        "guidance": "STOP ngay; không đọc OTP; gọi tổng đài trên thẻ/app chính thức.",
    },
    {
        "id": "cong_an_scam",
        "keywords": ["công an", "khởi tố", "rửa tiền", "điều tra", "authority"],
        "title": "Giả danh công an / cơ quan điều tra",
        "guidance": "STOP; không chuyển tiền 'tài khoản an toàn'; xác minh tại trụ sở.",
    },
    {
        "id": "safe_account",
        "keywords": ["tài khoản an toàn", "tài khoản trung gian", "phong tỏa", "safe_account"],
        "title": "Chiêu tài khoản an toàn / phong tỏa",
        "guidance": "STOP; ngân hàng không yêu cầu chuyển sang TK khác qua điện thoại.",
    },
    {
        "id": "remote_access",
        "keywords": ["anydesk", "teamviewer", "điều khiển", "chia sẻ màn hình", "remote"],
        "title": "Yêu cầu remote access",
        "guidance": "STOP; không cài app điều khiển; có thể mất toàn bộ tiền.",
    },
    {
        "id": "blacklist_payee",
        "keywords": ["blacklist", "danh sách đen", "lừa đảo", "blacklist_exact_match"],
        "title": "Người nhận trong blacklist",
        "guidance": "STOP/PAUSE + HITL; không override bằng trusted soft signal.",
    },
    {
        "id": "investment_scam",
        "keywords": ["đầu tư", "sinh lời", "cổ phiếu", "forex", "investment", "lãi cao"],
        "title": "Lừa đảo đầu tư / cam kết lãi cao",
        "guidance": "PAUSE/STOP; xác minh giấy phép; không chuyển theo lời khuyên điện thoại lạ.",
    },
    {
        "id": "secrecy_isolation",
        "keywords": ["bí mật", "đừng nói", "không được kể", "secrecy", "giữ bí mật"],
        "title": "Ép giữ bí mật / cô lập nạn nhân",
        "guidance": "PAUSE; đây là tín hiệu social engineering phổ biến — hỏi người thân/tổng đài.",
    },
    {
        "id": "credential_harvest",
        "keywords": ["mật khẩu", "pin", "đăng nhập", "credential", "tên đăng nhập"],
        "title": "Thu thập mật khẩu / PIN",
        "guidance": "STOP; ngân hàng không hỏi mật khẩu/PIN qua điện thoại.",
    },
    {
        "id": "urgency_pressure",
        "keywords": ["gấp", "ngay lập tức", "vài phút", "urgency", "trước 12h"],
        "title": "Ép thời gian quyết định",
        "guidance": "MONITOR→PAUSE nếu kèm authority/OTP; urgency đơn độc chưa đủ STOP.",
    },
    {
        "id": "delivery_ship_scam",
        "keywords": ["bưu điện", "phí ship", "kiện hàng", "hải quan", "delivery"],
        "title": "Giả danh bưu điện / phí hoàn thuế",
        "guidance": "PAUSE; kiểm tra mã vận đơn trên kênh chính thức, không chuyển lệ phí lạ.",
    },
    {
        "id": "account_lock_threat",
        "keywords": ["khóa tài khoản", "account_lock", "vô hiệu", "phong tỏa tài khoản"],
        "title": "Dọa khóa / phong tỏa tài khoản",
        "guidance": "PAUSE/STOP khi kèm đòi OTP hoặc chuyển tiền; xác minh app/CN chính thức.",
    },
    {
        "id": "new_payee_high_amount",
        "keywords": ["new_payee", "người nhận mới", "unusual_amount", "số tiền lớn"],
        "title": "Người nhận mới + số tiền bất thường",
        "guidance": "HITL; xác minh ngoài kênh chat/gọi lạ trước khi chuyển.",
    },
]


def retrieve_scam_context(
    *,
    signals: list[str] | None = None,
    text_blobs: list[str] | None = None,
    top_k: int = 3,
) -> list[dict[str, str]]:
    bag = " ".join([*(signals or []), *(text_blobs or [])]).lower()
    scored: list[tuple[int, dict[str, Any]]] = []
    for pat in _SEED:
        score = sum(1 for kw in pat["keywords"] if kw.lower() in bag)
        if score:
            scored.append((score, pat))
    scored.sort(key=lambda x: -x[0])
    out: list[dict[str, str]] = []
    for _, pat in scored[:top_k]:
        out.append(
            {
                "id": str(pat["id"]),
                "title": str(pat["title"]),
                "guidance": str(pat["guidance"]),
            }
        )
    return out
