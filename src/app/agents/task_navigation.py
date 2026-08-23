"""Deterministic, least-privilege task routing for the in-app assistant."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from src.app.schemas.assistant import (
    AssistantTaskState,
    AssistantTransferDraft,
    AssistantUiAction,
)

_TRANSFER_START_PHRASES = (
    "muon chuyen tien",
    "muon chuyen khoan",
    "can chuyen tien",
    "can chuyen khoan",
    "hay chuyen tien",
    "hay chuyen khoan",
    "chuyen tien ngay",
    "chuyen tien cho",
    "chuyen khoan cho",
    "muon gui",
    "can gui",
    "gui tien cho",
    "tao giao dich",
)
_TRANSFER_CANCEL_PHRASES = (
    "huy chuyen tien",
    "huy chuyen khoan",
    "dung chuyen tien",
    "dung chuyen khoan",
    "khong chuyen nua",
)
_GUARDIAN_TERMS = (
    "nghe va bao ve cuoc goi",
    "bao ve cuoc goi",
    "tu dong nghe",
    "guardian",
)
_NAVIGATION_INTENTS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "/me?open=password",
        ("doi mat khau", "thay mat khau", "cap nhat mat khau"),
        "Đã mở phần đổi mật khẩu. Bạn hãy tự nhập mật khẩu hiện tại và mật khẩu mới tại đó.",
    ),
    (
        "/me?open=pin",
        ("doi pin", "thay pin", "cap nhat pin", "ma pin giao dich"),
        "Đã mở phần cập nhật mã PIN giao dịch.",
    ),
    (
        "/setup-pin",
        ("tao pin", "cai dat pin", "dang ky pin"),
        "Đã mở phần tạo mã PIN giao dịch.",
    ),
    (
        "/setup-face",
        ("face id", "faceid", "khuon mat", "nhan dien khuon mat"),
        "Đã mở phần cài đặt Face ID.",
    ),
    (
        "/qr?mode=scan",
        ("quet qr", "quet ma qr", "thanh toan qr", "mo qr"),
        "Đã mở tính năng quét mã QR an toàn.",
    ),
    (
        "/qr?mode=create",
        ("tao qr", "ma qr cua toi", "nhan tien bang qr", "tao ma qr"),
        "Đã mở phần tạo mã QR nhận tiền.",
    ),
    (
        "/history",
        ("lich su giao dich", "xem lich su", "giao dich gan day", "lich su chuyen tien"),
        "Đã mở lịch sử giao dịch của bạn.",
    ),
    (
        "/me",
        (
            "ho so",
            "tai khoan cua toi",
            "thong tin ca nhan",
            "quan ly tai khoan",
            "cai dat tai khoan",
            "doi anh dai dien",
            "dang xuat",
        ),
        "Đã mở trang Hồ sơ và cài đặt tài khoản.",
    ),
    (
        "/transfer",
        (
            "trang chuyen tien",
            "mo chuyen tien",
            "vao chuyen tien",
            "den chuyen tien",
        ),
        "Đã mở trang Chuyển tiền. Bạn có thể nhập thông tin giao dịch tại đó.",
    ),
    (
        "/dashboard",
        ("trang chu", "tong quan", "ve trang chu", "mo trang tong quan"),
        "Đã mở trang Tổng quan.",
    ),
)
_KNOWN_BANKS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ABB", ("abbank", "abb")),
    ("ACB", ("acb",)),
    ("AGRIBANK", ("agribank",)),
    ("BAB", ("bac a bank", "bab")),
    ("BIDV", ("bidv",)),
    ("BVB", ("baoviet bank", "bvb")),
    ("CAKE", ("cake by vpbank", "cake")),
    ("CIMB", ("cimb",)),
    ("CTG", ("vietinbank", "vietin", "ctg")),
    ("EIB", ("eximbank", "eib")),
    ("GPB", ("gpbank", "gpb")),
    ("HDB", ("hdbank", "hdb")),
    ("HSBC", ("hsbc",)),
    ("IVB", ("indovina", "ivb")),
    ("KBANK", ("kasikornbank", "kbank")),
    ("KLB", ("kienlongbank", "klb")),
    ("LPB", ("lpbank", "lienvietpostbank", "lpb")),
    ("MBB", ("mb bank", "mbbank", "mbb")),
    ("MSB", ("msb", "maritime bank")),
    ("NAB", ("nam a bank", "nab")),
    ("OCB", ("ocb",)),
    ("PGB", ("pgbank", "pgb")),
    ("PVCB", ("pvcombank", "pvcb")),
    ("SCB", ("scb",)),
    ("SCVN", ("standard chartered", "scvn")),
    ("SEAB", ("seabank", "seab")),
    ("SGB", ("saigonbank", "sgb")),
    ("SHB", ("shb",)),
    ("SHINHAN", ("shinhan",)),
    ("STB", ("sacombank", "stb")),
    ("TCB", ("techcombank", "techcom", "tcb")),
    ("TIMO", ("timo",)),
    ("TIMI", ("timi bank", "timi")),
    ("TPB", ("tpbank", "tpb")),
    ("UBANK", ("ubank",)),
    ("UOB", ("uob",)),
    ("VAB", ("viet a bank", "vab")),
    ("VCB", ("vietcombank", "vietcom", "vcb")),
    ("VIB", ("vib",)),
    ("VPB", ("vpbank", "vp bank", "vpb")),
    ("WOORI", ("woori",)),
)
_ACCOUNT_PATTERN = re.compile(r"(?<!\d)(?:\d[ .-]?){6,19}\d(?!\d)")
_ACCOUNT_LABEL_PATTERN = re.compile(
    r"(?:stk|so\s*tk|so\s*tai\s*khoan|tai\s*khoan)\s*(?:la|:|=)?\s*"
    r"((?:\d[ .-]?){5,18}\d)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class TaskNavigationDecision:
    """A routing result; only the browser can execute its allowed UI action."""

    handled: bool
    answer: str | None
    task_state: AssistantTaskState
    action: AssistantUiAction | None = None
    history_message: str | None = None


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return without_accents.replace("đ", "d")


def _canonical_bank_code(message: str) -> str | None:
    normalized = _normalize(message)
    for code, aliases in _KNOWN_BANKS:
        if any(alias in normalized for alias in aliases):
            return code
    return None


def _extract_account(message: str, *, allow_bare: bool) -> str | None:
    match = _ACCOUNT_LABEL_PATTERN.search(_normalize(message))
    if not match and allow_bare:
        match = _ACCOUNT_PATTERN.search(message)
    if not match:
        return None
    account = re.sub(r"\D", "", match.group(1) if match.lastindex else match.group(0))
    return account if 6 <= len(account) <= 19 else None


def _extract_amount(message: str, *, allow_bare: bool) -> int | None:
    normalized = _normalize(message)
    compact = normalized.replace(" ", "")
    multiplier = 1
    match = re.search(r"(?<!\d)(\d+(?:[.,]\d{3})*)(?:\s*)(trieu|tr|nghin|k|vnd|dong|d)(?![a-z])", normalized)
    if match:
        value, unit = match.groups()
        if unit in {"trieu", "tr"}:
            multiplier = 1_000_000
        elif unit in {"nghin", "k"}:
            multiplier = 1_000
    else:
        match = re.search(
            r"(?:so\s*tien|chuyen\s*(?:tien|khoan)?|gui)\s*(?:la|:|=)?\s*"
            r"(\d+(?:[.,]\d{3})*)",
            compact,
        )
        if not match and allow_bare:
            match = re.fullmatch(r"\s*(\d+(?:[.,]\d{3})*)\s*", normalized)
        if not match:
            return None
        value = match.group(1)
    amount = int(re.sub(r"\D", "", value)) * multiplier
    return amount if 1 <= amount <= 999_999_999 else None


def _is_transfer_start(message: str) -> bool:
    normalized = _normalize(message)
    return any(phrase in normalized for phrase in _TRANSFER_START_PHRASES)


def _is_transfer_cancel(message: str) -> bool:
    normalized = _normalize(message)
    return any(phrase in normalized for phrase in _TRANSFER_CANCEL_PHRASES)


def _is_guardian_disable_request(message: str) -> bool:
    normalized = _normalize(message)
    if any(
        phrase in normalized
        for phrase in (
            "khong tat",
            "dung tat",
            "khong muon tat",
            "cach tat",
            "huong dan tat",
            "lam sao tat",
        )
    ):
        return False
    return (
        any(term in normalized for term in _GUARDIAN_TERMS)
        and normalized.startswith(
            (
                "tat ",
                "dung ",
                "toi muon tat",
                "toi can tat",
                "hay tat",
                "toi muon dung",
                "toi can dung",
                "hay dung",
            )
        )
    )


def _is_guardian_enable_request(message: str) -> bool:
    """Accept only a direct request to enable the caller's Guardian preference."""
    normalized = _normalize(message)
    if any(
        phrase in normalized
        for phrase in (
            "khong bat",
            "dung bat",
            "khong muon bat",
            "cach bat",
            "huong dan bat",
            "lam sao bat",
        )
    ):
        return False
    return (
        any(term in normalized for term in _GUARDIAN_TERMS)
        and normalized.startswith(
            (
                "bat ",
                "mo ",
                "kich hoat ",
                "toi muon bat",
                "toi can bat",
                "hay bat",
                "toi muon mo",
                "toi can mo",
                "hay mo",
                "toi muon kich hoat",
                "toi can kich hoat",
                "hay kich hoat",
            )
        )
    )


def _navigation_request(message: str) -> tuple[str, str] | None:
    """Map clear product-navigation requests to a browser allowlist only."""
    normalized = _normalize(message)
    # Never soften a destructive account request into a harmless-looking page
    # navigation just because it happens to include words such as "tài khoản".
    # Such requests must remain out of this agent's authority.
    if any(
        phrase in normalized
        for phrase in (
            "xoa tai khoan",
            "dong tai khoan",
            "khoa tai khoan",
            "huy tai khoan",
            "xoa du lieu",
            "xoa giao dich",
        )
    ):
        return None
    for route, phrases, answer in _NAVIGATION_INTENTS:
        if any(_contains_whole_phrase(normalized, phrase) for phrase in phrases):
            return route, answer
    return None


def navigation_action_for_route(
    route: str,
    state: AssistantTaskState,
    *,
    history_message: str | None = None,
) -> TaskNavigationDecision | None:
    """Turn one validated allowlist route into a server-owned UI action.

    This is deliberately the only bridge from an LLM navigation intent to the
    browser. A model cannot supply its own URL, response wording, or action.
    """

    for allowed_route, _phrases, answer in _NAVIGATION_INTENTS:
        if route == allowed_route:
            return TaskNavigationDecision(
                handled=True,
                answer=answer,
                task_state=state,
                action=AssistantUiAction(type="navigate_app", route=allowed_route),
                history_message=_redact_history_message(history_message or ""),
            )
    return None


def _contains_whole_phrase(text: str, phrase: str) -> bool:
    """Match route intents on word boundaries, never on a word prefix.

    Vietnamese text is normalized before matching.  A raw substring check made
    ``trang chu`` (home) match ``trang chuyen tien`` (transfer) because
    ``chuyen`` begins with ``chu`` after removing accents.  This helper keeps
    the phrase readable while rejecting that unsafe partial match.
    """

    return bool(
        re.search(
            rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])",
            text,
        )
    )


def _redact_history_message(message: str) -> str:
    def mask(match: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        return f"••••{digits[-4:]}"

    return _ACCOUNT_PATTERN.sub(mask, message)


def _empty_state() -> AssistantTaskState:
    return AssistantTaskState()


def _next_question(draft: AssistantTransferDraft, newly_recorded: str | None) -> str:
    prefix = f"Đã ghi nhận {newly_recorded}. " if newly_recorded else ""
    if not draft.recipient_account:
        return f"{prefix}Vui lòng nhập số tài khoản người nhận (6–19 chữ số)."
    if not draft.bank_code:
        return f"{prefix}Số tài khoản này thuộc ngân hàng nào?"
    if not draft.amount:
        return f"{prefix}Bạn muốn chuyển bao nhiêu tiền?"
    return prefix


def _route_transfer(message: str, state: AssistantTaskState) -> TaskNavigationDecision:
    draft = state.transfer.model_copy(deep=True)
    newly_recorded: str | None = None
    amount = _extract_amount(message, allow_bare=bool(draft.recipient_account))
    account = _extract_account(
        message,
        allow_bare=not draft.recipient_account and amount is None,
    )
    bank_code = _canonical_bank_code(message)
    if not draft.recipient_account and account:
        draft.recipient_account = account
        newly_recorded = "số tài khoản"
    if not draft.bank_code and bank_code:
        draft.bank_code = bank_code
        newly_recorded = f"ngân hàng {bank_code}"
    if not draft.amount and amount:
        draft.amount = amount
        newly_recorded = f"số tiền {amount:,.0f}đ".replace(",", ".")

    # Timi Bank uses the user's verified 10-digit phone number as the account
    # number.  Do not navigate to a review whose recipient lookup will fail.
    if draft.bank_code == "TIMI" and draft.recipient_account and len(draft.recipient_account) != 10:
        draft.recipient_account = None
        return TaskNavigationDecision(
            handled=True,
            answer="Tài khoản Timi Bank cần đúng 10 chữ số. Vui lòng nhập lại số tài khoản.",
            task_state=AssistantTaskState(task="transfer", transfer=draft),
            history_message=_redact_history_message(message),
        )

    if all((draft.recipient_account, draft.bank_code, draft.amount)):
        return TaskNavigationDecision(
            handled=True,
            answer=(
                "Mình đã có đủ thông tin. Mở trang xem lại giao dịch để Timi tra cứu đúng "
                "tên chủ tài khoản. Bạn hãy kiểm tra lại người nhận, số tiền và tự bấm kiểm tra "
                "rủi ro/xác nhận nếu đồng ý."
            ),
            task_state=_empty_state(),
            action=AssistantUiAction(
                type="navigate_transfer_review",
                transfer=draft,
            ),
            history_message=_redact_history_message(message),
        )

    return TaskNavigationDecision(
        handled=True,
        answer=_next_question(draft, newly_recorded),
        task_state=AssistantTaskState(task="transfer", transfer=draft),
        history_message=_redact_history_message(message),
    )


def route_task(message: str, state: AssistantTaskState) -> TaskNavigationDecision:
    """Route only the two explicit, least-privilege task families.

    Unknown requests deliberately return ``handled=False`` so the chat support
    agent can answer product questions.  This agent cannot execute transfers,
    change account data, or control any role outside its declared capabilities.
    """
    if _is_guardian_disable_request(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã tắt tự động nghe và bảo vệ cuộc gọi theo yêu cầu của bạn.",
            task_state=state,
            action=AssistantUiAction(
                type="set_guardian_voice_monitoring",
                voice_monitoring_enabled=False,
            ),
            history_message=message,
        )

    if _is_guardian_enable_request(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã bật tự động nghe và bảo vệ cuộc gọi theo yêu cầu của bạn.",
            task_state=state,
            action=AssistantUiAction(
                type="set_guardian_voice_monitoring",
                voice_monitoring_enabled=True,
            ),
            history_message=message,
        )

    navigation = _navigation_request(message)
    if navigation:
        route, _answer = navigation
        decision = navigation_action_for_route(route, state, history_message=message)
        if decision is not None:
            return decision

    if state.task == "transfer" and _is_transfer_cancel(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã hủy phần chuẩn bị chuyển tiền. Mình chưa tạo hay thực hiện giao dịch nào.",
            task_state=_empty_state(),
            history_message=message,
        )

    if state.task == "transfer" or _is_transfer_start(message):
        return _route_transfer(message, state if state.task == "transfer" else _empty_state())

    return TaskNavigationDecision(
        handled=False,
        answer=None,
        task_state=state,
    )
