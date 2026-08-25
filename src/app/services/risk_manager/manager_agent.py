"""Bank Risk Manager Agent — LLM recommendation only (Phase 2 v0.1).

Does NOT execute transfer / lock account / DB writes.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import yaml

from .schema import (
    ManagerOutput,
    ManagerRequest,
    apply_safety_floor,
    validate_manager_output,
)

PROMPTS_DIR = Path(__file__).resolve().parents[4] / "prompts"
# Fallback when copied into monorepo root structure:
_ALT_PROMPTS = Path(__file__).resolve().parents[3] / "prompts"


def load_manager_prompt(version: str = "0.1") -> dict[str, Any]:
    for base in (PROMPTS_DIR, _ALT_PROMPTS, Path("prompts")):
        path = base / f"manager_v{version}.yaml"
        if path.is_file():
            with open(path, encoding="utf-8") as f:
                return yaml.safe_load(f)
    raise FileNotFoundError(f"manager_v{version}.yaml not found in prompts/")


def _build_user_message(req: ManagerRequest) -> str:
    payload = {
        "request_id": req.request_id,
        "context": req.context.model_dump(),
        "specialists": req.specialists.model_dump(),
    }
    return (
        "Dưới đây là tóm tắt có cấu trúc từ các specialist. "
        "Hãy đưa khuyến nghị cuối theo đúng schema JSON đã quy định.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _default_manager_version() -> str:
    env = os.getenv("MANAGER_PROMPT_VERSION")
    if env:
        return env.strip()
    try:
        from src.app.config import get_settings
        return str(getattr(get_settings(), "manager_prompt_version", None) or "0.2")
    except Exception:
        return "0.2"


def run_manager_llm(req: ManagerRequest, *, version: str | None = None) -> ManagerOutput:
    """Call Groq (or OpenAI-compatible) with manager prompt. Raises on hard failure."""
    version = version or _default_manager_version()
    prompt_cfg = load_manager_prompt(version)
    system = prompt_cfg["system_prompt"]
    # Env wins: MANAGER_MODEL > GUARDIAN_AGENT_MODEL > yaml > default
    model = (
        os.getenv("MANAGER_MODEL")
        or os.getenv("GUARDIAN_AGENT_MODEL")
        or prompt_cfg.get("model_recommendation")
        or "openai/gpt-oss-20b"
    )
    temperature = float(prompt_cfg.get("temperature", 0))
    max_tokens = int(prompt_cfg.get("max_completion_tokens", 700))

    api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY (or OPENAI_API_KEY) required for Manager LLM")

    # Prefer Groq OpenAI-compatible endpoint
    base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    if os.getenv("OPENAI_API_KEY") and not os.getenv("GROQ_API_KEY"):
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("pip install openai") from e

    client = OpenAI(api_key=api_key, base_url=base_url)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": _build_user_message(req)},
    ]
    # gpt-oss / reasoning models burn tokens before JSON — floor max_tokens
    max_tokens = max(max_tokens, 1200)

    last_err: Exception | None = None
    raw = "{}"
    for attempt in range(2):
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens + attempt * 400,
                "messages": messages,
            }
            # json_object can fail on some reasoning models mid-generation
            if attempt == 0:
                kwargs["response_format"] = {"type": "json_object"}
            resp = client.chat.completions.create(**kwargs)
            raw = resp.choices[0].message.content or "{}"
            data = _extract_json(raw)
            output = validate_manager_output(data)
            return apply_safety_floor(
                output,
                req.specialists,
                session_type=req.context.session_type,
            )
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Manager LLM failed after retries: {last_err}") from last_err


def run_manager_deterministic(req: ManagerRequest) -> ManagerOutput:
    """Offline policy-only path for CI / no API key (still max-severity)."""
    sp = req.specialists
    action = "CONTINUE"
    evidence: list[str] = []
    missing: list[str] = []
    escalate = False
    conf = 0.75
    parts: list[str] = []

    cg = sp.call_guardian
    if cg.available:
        action = max(
            [action, str(cg.recommended_action)],
            key=lambda a: {"CONTINUE": 0, "MONITOR": 1, "PAUSE": 2, "STOP": 3}.get(a, 0),
        )
        evidence.extend(f"call_guardian.{s}" for s in cg.signals[:4])
        evidence.append("call_guardian.recommended_action")
        parts.append(cg.summary or f"Guardian: {cg.recommended_action}")
        conf = min(conf, max(cg.decision_confidence, 0.4))
    elif req.context.session_type in ("call_only", "call_and_tx"):
        missing.append("kết quả Call Guardian")
        escalate = True
        action = "PAUSE"
        conf = 0.4
        parts.append("Thiếu đánh giá cuộc gọi (fail-closed).")

    tx = sp.transaction_risk
    if tx.available:
        if tx.risk_score >= 90 or any("blacklist" in s.lower() for s in tx.signals):
            action = "STOP" if action != "STOP" else action
            action = max(
                [action, "STOP"],
                key=lambda a: {"CONTINUE": 0, "MONITOR": 1, "PAUSE": 2, "STOP": 3}.get(a, 0),
            )
        elif tx.risk_level.lower() == "high" or tx.requires_hitl:
            action = max(
                [action, "PAUSE"],
                key=lambda a: {"CONTINUE": 0, "MONITOR": 1, "PAUSE": 2, "STOP": 3}.get(a, 0),
            )
        evidence.extend(f"transaction_risk.{s}" for s in tx.signals[:4])
        parts.append(tx.summary or f"Tx risk={tx.risk_level}")
        if tx.requires_hitl:
            escalate = True

    bp = sp.behavior_profiler
    if bp.available and bp.anomalies:
        action = max(
            [action, "PAUSE"],
            key=lambda a: {"CONTINUE": 0, "MONITOR": 1, "PAUSE": 2, "STOP": 3}.get(a, 0),
        )
        evidence.extend(f"behavior_profiler.{a}" for a in bp.anomalies[:3])
        parts.append(bp.summary or "Behavior anomaly")

    rationale = " ".join(parts) if parts else "Không đủ tín hiệu; giữ an toàn."
    if len(rationale) < 20:
        rationale = rationale + " Đánh giá theo policy max-severity và fail-closed của Timi."

    out = ManagerOutput(
        recommended_action=action,  # type: ignore[arg-type]
        confidence=round(conf, 2),
        rationale=rationale[:800],
        evidence_used=evidence[:12],
        missing_info=missing,
        escalate_to_human=escalate,
    )
    return apply_safety_floor(out, sp, session_type=req.context.session_type)
