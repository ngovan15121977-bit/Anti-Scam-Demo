"""Admin email — gửi toàn bộ user trong hệ thống (đơn giản).

Mount trong main.py:

    from src.app.api import admin_emails
    app.include_router(admin_emails.router, prefix="/api/v1")
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.core.deps import require_admin
from src.app.db.session import get_db
from src.app.models.user import User
from src.app.services.audit import add_audit_log
from src.app.services.email_service import send_email, wrap_broadcast_html

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/emails",
    tags=["admin-emails"],
    dependencies=[Depends(require_admin)],
)


class BroadcastRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    html: str = Field(min_length=1, max_length=50_000)
    dry_run: bool = False


class ProductUpdateRequest(BaseModel):
    version: str | None = Field(default=None, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20_000)
    send_now: bool = True


class BroadcastResult(BaseModel):
    queued: int
    dry_run: bool
    message: str


def _all_users_with_email(db: Session) -> list[tuple[str, str]]:
    users = list(
        db.scalars(
            select(User).where(User.email.is_not(None), User.email != "")
        ).all()
    )
    return [
        (u.email, getattr(u, "full_name", None) or "bạn")
        for u in users
        if u.email
    ]


def _send_batch(
    *,
    recipients: list[tuple[str, str]],
    subject: str,
    html: str,
) -> None:
    wrapped = wrap_broadcast_html(body_html=html, preheader=subject)
    for email, name in recipients:
        personalized = wrapped.replace("{{full_name}}", name or "bạn")
        send_email(to=email, subject=subject, html=personalized)


@router.post("/broadcast", response_model=BroadcastResult)
def broadcast_email(
    payload: BroadcastRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> BroadcastResult:
    recipients = _all_users_with_email(db)

    if payload.dry_run:
        admin_email = getattr(admin, "email", None)
        if not admin_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin chưa có email để gửi thử",
            )
        background_tasks.add_task(
            send_email,
            to=admin_email,
            subject=f"[DRY-RUN] {payload.subject}",
            html=wrap_broadcast_html(
                body_html=payload.html, preheader=payload.subject
            ),
        )
        add_audit_log(
            db,
            action="email.broadcast_dry_run",
            actor_id=admin.id,
            resource_type="email",
            resource_id=None,
            metadata={
                "subject": payload.subject,
                "candidate_count": len(recipients),
            },
        )
        db.commit()
        return BroadcastResult(
            queued=1,
            dry_run=True,
            message=(
                f"Đã xếp hàng gửi thử tới {admin_email}. "
                f"Tổng user có email: {len(recipients)}."
            ),
        )

    if not recipients:
        return BroadcastResult(
            queued=0,
            dry_run=False,
            message="Không có user nào có email.",
        )

    background_tasks.add_task(
        _send_batch,
        recipients=recipients,
        subject=payload.subject,
        html=payload.html,
    )
    add_audit_log(
        db,
        action="email.broadcast",
        actor_id=admin.id,
        resource_type="email",
        resource_id=None,
        metadata={
            "subject": payload.subject,
            "recipient_count": len(recipients),
        },
    )
    db.commit()
    return BroadcastResult(
        queued=len(recipients),
        dry_run=False,
        message=f"Đã xếp hàng gửi {len(recipients)} email tới toàn bộ user.",
    )


@router.post("/product-update", response_model=BroadcastResult)
def publish_product_update(
    payload: ProductUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> BroadcastResult:
    version_prefix = f"[{payload.version}] " if payload.version else ""
    subject = f"[Timi] {version_prefix}{payload.title}"
    body_html = f"""
      <h2 style="margin-top:0;color:#0f172a">{payload.title}</h2>
      {f'<p style="color:#64748b;font-size:13px">Phiên bản {payload.version}</p>' if payload.version else ""}
      <div style="white-space:pre-wrap;line-height:1.6">{payload.body}</div>
    """

    if not payload.send_now:
        add_audit_log(
            db,
            action="email.product_update_saved",
            actor_id=admin.id,
            resource_type="product_update",
            resource_id=None,
            metadata={
                "version": payload.version,
                "title": payload.title,
                "send_now": False,
            },
        )
        db.commit()
        return BroadcastResult(
            queued=0,
            dry_run=False,
            message="Đã lưu cập nhật (không gửi mail).",
        )

    recipients = _all_users_with_email(db)
    if not recipients:
        return BroadcastResult(
            queued=0,
            dry_run=False,
            message="Không có user nào có email.",
        )

    background_tasks.add_task(
        _send_batch,
        recipients=recipients,
        subject=subject,
        html=body_html,
    )
    add_audit_log(
        db,
        action="email.product_update_sent",
        actor_id=admin.id,
        resource_type="product_update",
        resource_id=None,
        metadata={
            "version": payload.version,
            "title": payload.title,
            "recipient_count": len(recipients),
        },
    )
    db.commit()
    return BroadcastResult(
        queued=len(recipients),
        dry_run=False,
        message=f"Đã công bố và xếp hàng gửi {len(recipients)} email.",
    )