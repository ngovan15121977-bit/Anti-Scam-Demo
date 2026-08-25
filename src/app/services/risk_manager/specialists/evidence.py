"""Evidence & Explanation Specialist — deterministic v0."""
from __future__ import annotations
from typing import Any
from ..schema import ManagerOutput, SpecialistPack

def build_evidence_pack(
    specialists: SpecialistPack,
    manager: ManagerOutput | None = None,
) -> dict[str, Any]:
    bullets: list[str] = []
    cg = specialists.call_guardian
    if cg.available:
        bullets.append(
            f"Cuộc gọi: {cg.recommended_action} "
            f"(score={cg.risk_score}, level={cg.risk_level}, conf={cg.decision_confidence:.2f})"
        )
        for s in cg.signals[:5]:
            bullets.append(f"  · tín hiệu gọi: {s}")
        if cg.summary:
            bullets.append(f"  · tóm tắt: {cg.summary[:160]}")
    else:
        bullets.append("Cuộc gọi: không có đánh giá Guardian (unavailable)")

    tx = specialists.transaction_risk
    if tx.available:
        bullets.append(
            f"Giao dịch: level={tx.risk_level} score={tx.risk_score:.0f} "
            f"HITL={'có' if tx.requires_hitl else 'không'}"
        )
        for s in tx.signals[:5]:
            bullets.append(f"  · tín hiệu GD: {s}")
        if tx.summary:
            bullets.append(f"  · tóm tắt: {tx.summary[:160]}")
    else:
        bullets.append("Giao dịch: không có đánh giá Transaction (unavailable)")

    bp = specialists.behavior_profiler
    if bp.available:
        bullets.append(
            "Hành vi: " + (", ".join(bp.anomalies[:6]) if bp.anomalies else "không anomaly")
        )
    else:
        bullets.append("Hành vi: chưa có dữ liệu profiler")

    management_why = manager.rationale if manager else ""
    if manager is not None:
        bullets.append(
            f"Manager đề xuất: {manager.recommended_action} "
            f"(conf={manager.confidence:.2f}, escalate={manager.escalate_to_human})"
        )

    action = (manager.recommended_action if manager else "PAUSE").upper()
    questions: list[str] = []
    if action in ("PAUSE", "STOP"):
        questions = [
            "Bạn đã xác minh người nhận qua kênh chính thức chưa?",
            "Có ai yêu cầu OTP, mã PIN hoặc app điều khiển từ xa không?",
            "Bạn có chắc số tài khoản nhận là đúng người định chuyển không?",
        ]
    elif action == "MONITOR":
        questions = ["Bạn đã từng giao dịch với người nhận này trước đây chưa?"]

    return {
        "available": True,
        "bullets": bullets,
        "management_explanation": management_why,
        "verification_questions": questions,
        "evidence_used": list(manager.evidence_used) if manager else [],
        "missing_info": list(manager.missing_info) if manager else [],
    }