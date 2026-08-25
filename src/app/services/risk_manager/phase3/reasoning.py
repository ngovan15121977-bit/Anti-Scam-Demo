"""Multi-step Manager: Extract → Critique → Final (Phase 3).

Still no execution tools. Uses Phase 2 Manager under the hood + memory/RAG context.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from ..schema import ManagerOutput, ManagerRequest, apply_safety_floor, validate_manager_output
from .escalation import should_escalate
from .feedback import load_feedback_hints
from .memory import get_memory_store
from .rag_light import retrieve_scam_context

logger = logging.getLogger(__name__)


def _extract_facts(req: ManagerRequest) -> dict[str, Any]:
    sp = req.specialists
    facts = {
        "session_type": req.context.session_type,
        "guardian": sp.call_guardian.model_dump() if sp.call_guardian.available else {"available": False},
        "transaction": sp.transaction_risk.model_dump() if sp.transaction_risk.available else {"available": False},
        "behavior": sp.behavior_profiler.model_dump(),
    }
    return facts


def _specialist_conflict(req: ManagerRequest) -> bool:
    sp = req.specialists
    ranks = {"CONTINUE": 0, "MONITOR": 1, "PAUSE": 2, "STOP": 3}
    actions = []
    if sp.call_guardian.available:
        actions.append(ranks.get(str(sp.call_guardian.recommended_action).upper(), 0))
    if sp.transaction_risk.available:
        if "blacklist" in " ".join(sp.transaction_risk.signals).lower() or sp.transaction_risk.risk_score >= 90:
            actions.append(3)
        elif sp.transaction_risk.requires_hitl or sp.transaction_risk.risk_level.lower() == "high":
            actions.append(2)
    return len(actions) >= 2 and max(actions) - min(actions) >= 2


def run_multistep_manager(
    req: ManagerRequest,
    *,
    session_key: str = "default",
    use_llm: bool = True,
    record_memory: bool = True,
) -> tuple[ManagerOutput, dict[str, Any]]:
    """
    Extract facts → attach memory/RAG → Manager decision → escalate policy → store memory.
    """
    from ..manager_agent import run_manager_deterministic, run_manager_llm

    # 1) Extract
    facts = _extract_facts(req)
    mem = get_memory_store()
    uid = req.context.user_id_hash or "anon"
    mem_ctx = mem.context_for_manager(session_key, uid)

    signals: list[str] = []
    if req.specialists.call_guardian.available:
        signals.extend(req.specialists.call_guardian.signals)
    if req.specialists.transaction_risk.available:
        signals.extend(req.specialists.transaction_risk.signals)
    if req.specialists.behavior_profiler.available:
        signals.extend(req.specialists.behavior_profiler.anomalies)

    # 2) RAG light
    rag_hits = retrieve_scam_context(signals=signals, text_blobs=[
        req.specialists.call_guardian.summary,
        req.specialists.transaction_risk.summary,
    ])
    fb = load_feedback_hints()

    # Inject controlled context into request via temporary summary fields (no schema break)
    # Critique notes carried in trace only; final still from Manager + floor
    critique = {
        "memory": mem_ctx,
        "rag": rag_hits,
        "feedback_hint": fb.get("hint") or "",
        "specialist_conflict": _specialist_conflict(req),
        "five_questions_required": [
            "Tình huống hiện tại?",
            "Bằng chứng mạnh/yếu?",
            "Kịch bản xấu nhất nếu CONTINUE?",
            "Còn thiếu thông tin gì?",
            "Mức tin cậy?",
        ],
    }

    # Enrich guardian/tx summary with memory line for LLM (bounded)
    if req.specialists.call_guardian.available:
        g = req.specialists.call_guardian
        extra = f" [Memory: {mem_ctx['session_summary'][:120]}]"
        if rag_hits:
            extra += f" [RAG: {rag_hits[0]['title']}]"
        req = req.model_copy(
            update={
                "specialists": req.specialists.model_copy(
                    update={
                        "call_guardian": g.model_copy(
                            update={"summary": (g.summary + extra)[:300]}
                        )
                    }
                )
            }
        )

    # 3) Final decision
    try:
        if use_llm:
            out = run_manager_llm(req)
        else:
            out = run_manager_deterministic(req)
    except Exception as exc:
        logger.warning("multistep LLM fail: %s — deterministic", exc)
        out = run_manager_deterministic(req)

    # 4) Escalation overlay
    esc = should_escalate(
        confidence=out.confidence,
        action=out.recommended_action,
        missing_info=out.missing_info,
        user_risk_tier=str(mem_ctx.get("user_risk_tier") or "standard"),
        progressive_signal_count=len(mem_ctx.get("progressive_signals") or []),
        specialist_conflict=bool(critique["specialist_conflict"]),
        requires_hitl=bool(
            req.specialists.transaction_risk.available
            and req.specialists.transaction_risk.requires_hitl
        ),
    )
    if esc and not out.escalate_to_human:
        out = out.model_copy(update={"escalate_to_human": True})

    out = apply_safety_floor(out, req.specialists, session_type=req.context.session_type)

    # 5) Memory write
    if record_memory:
        mem.record_decision(
            session_key=session_key,
            user_id_hash=uid,
            session_type=req.context.session_type,
            action=out.recommended_action,
            confidence=out.confidence,
            signals=signals,
            note=out.rationale[:120],
        )

    trace = {
        "facts": facts,
        "critique": critique,
        "rag_hits": rag_hits,
        "feedback": fb,
        "memory_after": mem.context_for_manager(session_key, uid),
    }
    return out, trace