"""Light retrieval for Manager context — keyword over static VN scam patterns.

Later: plug pgvector / vector_store + blacklist DB. No network required for v0.
"""

from __future__ import annotations

from typing import Any

# Seed patterns (VN) — expand from DB ScamPattern later
_SEED: list[dict[str, Any]] = [
    {
        "id": "otp_bank_impersonation",
        "keywords": ["otp", "ngân hàng", "mã xác thực", "bảo mật"],
        "title": "Giả danh ngân hàng — đòi OTP",
        "guidance": "STOP ngay; không đọc OTP; gọi tổng đài trên thẻ/app chính thức.",
    },
    {
        "id": "cong_an_scam",
        "keywords": ["công an", "khởi tố", "rửa tiền", "điều tra"],
        "title": "Giả danh công an / cơ quan điều tra",
        "guidance": "STOP; không chuyển tiền 'tài khoản an toàn'; xác minh tại trụ sở.",
    },
    {
        "id": "safe_account",
        "keywords": ["tài khoản an toàn", "tài khoản trung gian", "phong tỏa"],
        "title": "Chiêu tài khoản an toàn / phong tỏa",
        "guidance": "STOP; ngân hàng không yêu cầu chuyển sang TK khác qua điện thoại.",
    },
    {
        "id": "remote_access",
        "keywords": ["anydesk", "teamviewer", "điều khiển", "chia sẻ màn hình"],
        "title": "Yêu cầu remote access",
        "guidance": "STOP; không cài app điều khiển; có thể mất toàn bộ tiền.",
    },
    {
        "id": "blacklist_payee",
        "keywords": ["blacklist", "danh sách đen", "lừa đảo"],
        "title": "Người nhận trong blacklist",
        "guidance": "STOP/PAUSE + HITL; không override bằng trusted soft signal.",
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
        score = sum(1 for kw in pat["keywords"] if kw in bag)
        if score:
            scored.append((score, pat))
    scored.sort(key=lambda x: -x[0])
    out = []
    for _, pat in scored[:top_k]:
        out.append(
            {
                "id": pat["id"],
                "title": pat["title"],
                "guidance": pat["guidance"],
            }
        )
    return out