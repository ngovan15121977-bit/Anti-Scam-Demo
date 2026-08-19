"""Email delivery via Resend.

Env:
  EMAIL_ENABLED=true
  RESEND_API_KEY=re_xxx
  EMAIL_FROM=Timi <onboarding@resend.dev>
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import resend
except ImportError:  # pragma: no cover
    resend = None  # type: ignore


def _enabled() -> bool:
    return os.getenv("EMAIL_ENABLED", "false").lower() in {"1", "true", "yes"}


def _api_key() -> str:
    return (os.getenv("RESEND_API_KEY") or "").strip()


def _from_address() -> str:
    return (os.getenv("EMAIL_FROM") or "Timi <onboarding@resend.dev>").strip()


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Send one email. Returns True on success or when email is disabled."""
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — NOT sending to %s", to)
    return False   # trước đây return True → dễ hiểu nhầm

    if resend is None:
        logger.error("Package 'resend' is not installed. Run: pip install resend")
        return False

    key = _api_key()
    if not key:
        logger.warning("RESEND_API_KEY missing — cannot send email")
        return False

    resend.api_key = key
    params: dict = {
        "from": _from_address(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text

    try:
        result = resend.Emails.send(params)
        logger.info("Email sent to %s id=%s", to, getattr(result, "id", result))
        return True
    except Exception as e:
        logger.exception("Failed to send email to %s", to)
        print("RESEND ERROR:", type(e).__name__, e)
        if hasattr(e, "status_code"):
            print("STATUS:", e.status_code)
        if hasattr(e, "body"):
            print("BODY:", e.body)
        return False


def send_transaction_email(
    *,
    to: str,
    full_name: str,
    amount: int,
    counterparty: str,
    direction: str,
    status: str,
) -> bool:
    amount_str = f"{amount:,}".replace(",", ".") + " đ"
    title = (
        "Giao dịch thành công"
        if status == "completed"
        else f"Cập nhật giao dịch ({status})"
    )
    action = "đã chuyển đến" if direction == "out" else "đã nhận từ"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Banking</h2>
      <p>Xin chào <b>{full_name}</b>,</p>
      <p>Bạn {action} <b>{counterparty}</b> số tiền <b>{amount_str}</b>.</p>
      <p>Trạng thái: <b>{status}</b></p>
      <hr/>
      <p style="color:#64748b;font-size:12px">
        Email thông báo từ Timi. Nếu không phải bạn, hãy kiểm tra bảo mật tài khoản.
      </p>
    </div>
    """
    return send_email(to=to, subject=f"[Timi] {title}", html=html)


def send_security_email(
    *,
    to: str,
    full_name: str,
    title: str,
    message: str,
) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Security</h2>
      <p>Xin chào <b>{full_name}</b>,</p>
      <p><b>{title}</b></p>
      <p>{message}</p>
      <hr/>
      <p style="color:#64748b;font-size:12px">
        Nếu không phải bạn thao tác, hãy đổi mật khẩu / PIN ngay.
      </p>
    </div>
    """
    return send_email(to=to, subject=f"[Timi] {title}", html=html)


def wrap_broadcast_html(*, body_html: str, preheader: str = "") -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:linear-gradient(135deg,#7c3aed,#d946ef);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:20px">Timi</h1>
        <p style="margin:6px 0 0;color:#f5e9ff;font-size:12px">AI Financial Guardian</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        {f'<p style="display:none">{preheader}</p>' if preheader else ""}
        {body_html}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#64748b;font-size:12px;margin:0">
          Bạn nhận email vì đã đăng ký tài khoản Timi.
          Có thể tắt thông báo cập nhật trong phần Tài khoản.
        </p>
      </div>
    </div>
    """