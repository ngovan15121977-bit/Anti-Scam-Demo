"""Email delivery via SMTP (Gmail / Auto mail).

Env (.env):
  EMAIL_ENABLED=true
  EMAIL_HOST=smtp.gmail.com
  EMAIL_PORT=587
  EMAIL_USER=your@gmail.com
  EMAIL_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (16 ký tự)
  EMAIL_FROM=Timi <your@gmail.com>     # nên trùng EMAIL_USER với Gmail
"""

from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# load .env ở root project
_ROOT = Path(__file__).resolve().parents[3]  # chỉnh nếu path khác
load_dotenv(_ROOT / ".env")
# hoặc đơn giản:
load_dotenv()
logger = logging.getLogger(__name__)

BATCH_SIZE = 50  # gửi tuần tự, nghỉ nhẹ giữa các mail nếu cần


def _enabled() -> bool:
    return os.getenv("EMAIL_ENABLED", "false").lower() in {"1", "true", "yes"}


def _host() -> str:
    return (os.getenv("EMAIL_HOST") or "smtp.gmail.com").strip()


def _port() -> int:
    try:
        return int(os.getenv("EMAIL_PORT") or "587")
    except ValueError:
        return 587


def _user() -> str:
    return (os.getenv("EMAIL_USER") or "").strip()


def _password() -> str:
    # Gmail app password thường có dấu cách — bỏ khoảng trắng cho chắc
    return (os.getenv("EMAIL_PASSWORD") or "").replace(" ", "").strip()


def _from_address() -> str:
    raw = (os.getenv("EMAIL_FROM") or "").strip()
    if raw:
        return raw
    user = _user()
    return f"Timi <{user}>" if user else "Timi <noreply@localhost>"


def _resend_api_key() -> str:
    return (os.getenv("RESEND_API_KEY") or "").strip()


def _send_via_resend(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str],
) -> bool:
    """Send through Resend's HTTPS API, which works on Render Free."""
    from_address = (os.getenv("EMAIL_FROM") or "onboarding@resend.dev").strip()
    payload: dict[str, object] = {
        "from": from_address,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    request = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_resend_api_key()}",
            "Content-Type": "application/json",
            "User-Agent": "timi-antiscam/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_body = json.loads(response.read().decode("utf-8"))
        logger.info("Resend OK to %s subject=%s id=%s", to, subject, response_body.get("id"))
        return True
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        logger.error("Resend failed to %s status=%s body=%s", to, error.code, body)
    except (URLError, TimeoutError, OSError) as error:
        logger.error("Resend network error to %s: %s", to, error)
    except (ValueError, json.JSONDecodeError) as error:
        logger.error("Resend returned invalid response to %s: %s", to, error)
    return False


def _parse_from(from_header: str) -> tuple[str, str]:
    name, addr = parseaddr(from_header)
    if not addr:
        addr = _user()
    return name or "Timi", addr


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Gửi 1 email qua SMTP. True khi gửi thành công."""
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — NOT sending to %s", to)
        return False

    # Render Free blocks outbound SMTP ports. Prefer HTTPS when configured;
    # the SMTP path below remains available for local or paid deployments.
    if _resend_api_key():
        return _send_via_resend(to=to, subject=subject, html=html, text=text)

    user = _user()
    password = _password()
    if not user or not password:
        logger.warning("EMAIL_USER / EMAIL_PASSWORD missing — cannot send")
        print("SMTP ERROR: thiếu EMAIL_USER hoặc EMAIL_PASSWORD trong .env")
        return False

    from_name, from_addr = _parse_from(_from_address())
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to

    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    # Plain fallback nếu không có text
    else:
        msg.attach(MIMEText("Xem phiên bản HTML của email này.", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    host = _host()
    port = _port()

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
                server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())
        else:
            # 587 STARTTLS (Gmail mặc định)
            with smtplib.SMTP(host, port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())

        logger.info("SMTP OK to %s subject=%s", to, subject)
        print(f"SMTP OK → {to}")
        return True
    except Exception as e:
        logger.exception("SMTP failed to %s", to)
        print("SMTP ERROR:", type(e).__name__, e)
        return False


def send_batch_emails(
    *,
    items: list[dict],
) -> tuple[int, int]:
    """
    Gửi nhiều email tuần tự qua SMTP.

    items: [{ "to", "subject", "html", "text"? }, ...]
    Returns: (success_count, fail_count)
    """
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — skip batch (%d)", len(items))
        return 0, len(items)

    if not items:
        return 0, 0

    ok = fail = 0
    for i in range(0, len(items), BATCH_SIZE):
        chunk = items[i : i + BATCH_SIZE]
        for it in chunk:
            success = send_email(
                to=it["to"],
                subject=it["subject"],
                html=it["html"],
                text=it.get("text"),
            )
            if success:
                ok += 1
            else:
                fail += 1
        logger.info(
            "SMTP batch chunk %d–%d done",
            i + 1,
            i + len(chunk),
        )

    print(f"SMTP BATCH RESULT: ok={ok} fail={fail} total={len(items)}")
    return ok, fail


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
