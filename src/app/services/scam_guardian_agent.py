"""Agent-owned risk decisions for realtime Scam Guardian sessions.

The deterministic rule engine remains available for offline evaluation, but
the production call path uses this module.  The model owns the score,
threshold interpretation, signal selection, and recommended action.  This
module only performs transport and schema validation; it never executes a
transaction or changes a blacklist.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from src.app.config import get_settings
from src.app.schemas.guardian import GuardianAgentDecision
from src.app.services.scam_guardian import (
    GuardianConversationState,
    GuardianRiskResult,
    GuardianSignal,
)

logger = logging.getLogger(__name__)


class GuardianAgentUnavailableError(RuntimeError):
    """Raised when an agent decision cannot be obtained or validated."""

    def __init__(self, message: str, *, retry_after_seconds: float = 0) -> None:
        super().__init__(message)
        self.retry_after_seconds = max(0.0, retry_after_seconds)


_SYSTEM_PROMPT = """
Bạn là Guardian Risk Decision Agent của Timi, chuyên phân tích transcript cuộc
gọi có dấu hiệu lừa đảo tại Việt Nam. Bạn là thành phần duy nhất quyết định
risk_score, risk_level, ngưỡng ngữ cảnh và recommended_action cho từng đoạn
hội thoại. Backend sẽ không tự tính lại điểm hay dùng ngưỡng số cố định.

Chỉ phân tích nội dung transcript được cung cấp. Không được suy đoán danh tính
hay bịa bằng chứng. Các tín hiệu có thể dùng gồm (nhưng không giới hạn):
bank_impersonation, urgency, account_lock_threat, otp_request,
credential_social_engineering, prevent_external_verification, authority_claim,
authority_impersonation, legal_threat, secrecy_request, money_transfer_request,
safe_account_scam, remote_access_request, screen_sharing_request.

Hãy đánh giá toàn bộ diễn biến, không đánh dấu chỉ vì một từ riêng lẻ. Đặt
recommended_action là CONTINUE nếu an toàn, MONITOR nếu cần theo dõi, PAUSE
nếu phải tạm dừng để xác minh, và STOP nếu có nguy cơ rõ ràng cần ngăn giao
dịch/cuộc gọi. Bạn tự chọn ngưỡng phù hợp với bằng chứng và phải trả về một
quyết định ổn định, có thể giải thích được. Không gọi tool, không truy cập DB,
không yêu cầu người dùng cung cấp OTP/PIN.

Chỉ trả về JSON hợp lệ, không markdown, đúng các khóa:
{
  "risk_score": 0,
  "risk_level": "safe|warning|high|critical",
  "scenario": "string hoặc null",
  "recommended_action": "CONTINUE|MONITOR|PAUSE|STOP",
  "explanation": "giải thích ngắn bằng tiếng Việt",
  "signals": [
    {"signal_type":"...", "weight":0, "confidence":0.0, "evidence":"..."}
  ]
}
""".strip()


def _response_text(response: Any) -> str:
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, KeyError) as exc:
        raise GuardianAgentUnavailableError("Agent trả về response rỗng") from exc
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        # Some OpenAI-compatible gateways return content parts instead of a
        # single string.  Keep only text parts and ignore metadata.
        parts = [
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict) and part.get("type") in {"text", "output_text"}
        ]
        return "".join(parts).strip()
    raise GuardianAgentUnavailableError("Agent trả về nội dung không hợp lệ")


def _parse_json(content: str) -> GuardianAgentDecision:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    # A few OpenAI-compatible models prepend a short sentence despite the
    # JSON-only instruction. Keep only the outer JSON object in that case.
    if not cleaned.startswith("{"):
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GuardianAgentUnavailableError("Agent không trả về JSON hợp lệ") from exc

    try:
        payload = _normalize_decision_payload(payload)
    except GuardianAgentUnavailableError as exc:
        logger.warning("Guardian agent response normalization failed: %s", exc)
        raise
    try:
        return GuardianAgentDecision.model_validate(payload)
    except ValidationError as exc:
        # Do not log transcript/evidence. Field names are enough to diagnose a
        # provider model that drifted from the contract.
        logger.warning(
            "Guardian agent schema validation failed; fields=%s errors=%s",
            sorted(payload),
            [error.get("loc") for error in exc.errors()],
        )
        raise GuardianAgentUnavailableError("JSON quyết định của agent không đúng schema") from exc


def _normalize_decision_payload(payload: Any) -> dict[str, Any]:
    """Normalize harmless provider shape drift without changing the decision.

    The model still chooses the score and action. This adapter only accepts
    common aliases/number formats so a valid model response is not discarded
    because a gateway returned ``score`` instead of ``risk_score``.
    """

    if not isinstance(payload, dict):
        raise GuardianAgentUnavailableError("Agent JSON phải là object")
    # Some models wrap the requested object in a single ``decision`` key.
    for wrapper in ("decision", "result", "assessment"):
        nested = payload.get(wrapper)
        if isinstance(nested, dict):
            payload = nested
            break

    def first(*names: str) -> Any:
        for name in names:
            if name in payload and payload[name] is not None:
                return payload[name]
        return None

    raw_score = first("risk_score", "score", "riskScore", "risk")
    try:
        score_value = float(raw_score) if raw_score is not None else 0.0
    except (TypeError, ValueError):
        score_value = 0.0
    # Treat a probability-style score as 0..100 only when it is clearly in
    # the 0..1 range; ordinary integer scores remain untouched.
    if 0 < score_value <= 1:
        score_value *= 100
    score = max(0, min(100, round(score_value)))

    raw_action = first("recommended_action", "action", "recommendation", "decision_action")
    action_text = str(raw_action or "").strip().upper().replace("-", "_").replace(" ", "_")
    action_aliases = {
        "ALLOW": "CONTINUE",
        "SAFE": "CONTINUE",
        "CONTINUE_WITH_CAUTION": "MONITOR",
        "WARN": "MONITOR",
        "WARNING": "MONITOR",
        "REVIEW": "PAUSE",
        "VERIFY": "PAUSE",
        "BLOCK": "STOP",
        "DENY": "STOP",
        "STOP_CALL": "STOP",
    }
    action = action_aliases.get(action_text, action_text)
    if action not in {"CONTINUE", "MONITOR", "PAUSE", "STOP"}:
        action = ""

    raw_level = first("risk_level", "level", "riskLevel")
    level_text = str(raw_level or "").strip().lower()
    level_aliases = {
        "low": "safe",
        "none": "safe",
        "medium": "warning",
        "moderate": "warning",
        "severe": "critical",
    }
    level = level_aliases.get(level_text, level_text)
    if level not in {"safe", "warning", "high", "critical"}:
        level = {
            "CONTINUE": "safe",
            "MONITOR": "warning",
            "PAUSE": "high",
            "STOP": "critical",
        }.get(action, "")
    if not action:
        action = {
            "safe": "CONTINUE",
            "warning": "MONITOR",
            "high": "PAUSE",
            "critical": "STOP",
        }.get(level, "")
    if not action or not level:
        raise GuardianAgentUnavailableError("Agent thiếu risk_level hoặc recommended_action")
    if raw_score is None:
        score = {"CONTINUE": 0, "MONITOR": 35, "PAUSE": 65, "STOP": 100}[action]

    raw_signals = first("signals", "detected_signals", "risk_signals")
    if isinstance(raw_signals, dict):
        raw_signals = [raw_signals]
    normalized_signals: list[dict[str, Any]] = []
    for item in raw_signals if isinstance(raw_signals, list) else []:
        if isinstance(item, str):
            signal_type, weight, confidence, evidence = item, 0, 0.5, ""
        elif isinstance(item, dict):
            signal_type = first_from(item, "signal_type", "type", "name", "signal")
            weight = first_from(item, "weight", "score", "contribution")
            confidence = first_from(item, "confidence", "probability")
            evidence = first_from(item, "evidence", "reason", "match")
        else:
            continue
        if not signal_type:
            continue
        try:
            weight_value = max(0, min(100, round(float(weight or 0))))
        except (TypeError, ValueError):
            weight_value = 0
        try:
            confidence_value = float(confidence if confidence is not None else 0.5)
        except (TypeError, ValueError):
            confidence_value = 0.5
        normalized_signals.append(
            {
                "signal_type": str(signal_type)[:60],
                "weight": weight_value,
                "confidence": max(0.0, min(1.0, confidence_value)),
                "evidence": str(evidence or "")[:500],
            }
        )

    explanation = first("explanation", "reason", "rationale", "message")
    raw_scenario = first("scenario", "scam_type", "category")
    return {
        "risk_score": score,
        "risk_level": level,
        "scenario": str(raw_scenario)[:80] if raw_scenario is not None else None,
        "recommended_action": action,
        "explanation": str(explanation or "Guardian agent đã hoàn tất đánh giá.")[:1000],
        "signals": normalized_signals[:20],
    }


def first_from(payload: dict[str, Any], *names: str) -> Any:
    """Return the first non-null value from a provider signal object."""

    for name in names:
        if name in payload and payload[name] is not None:
            return payload[name]
    return None


def _conversation_payload(
    state: GuardianConversationState,
    latest_text: str,
) -> dict[str, Any]:
    # Bound context sent to the provider.  Raw transcript is never persisted
    # by this service and is sent only when the user has an active session.
    segments = [
        {"speaker": speaker, "text": text[:600]}
        for speaker, text in state.segments[-16:]
    ]
    return {
        "latest_transcript": latest_text[:2000],
        "conversation": segments,
        "task": "Return the next agent-owned risk decision as strict JSON.",
    }


def analyze_with_guardian_agent(
    state: GuardianConversationState,
    latest_text: str,
) -> GuardianRiskResult:
    """Ask Groq/OpenAI-compatible model for the authoritative risk decision."""

    settings = get_settings()
    if not settings.guardian_agent_enabled:
        raise GuardianAgentUnavailableError("Guardian risk agent đang bị tắt")
    if not settings.groq_api_key:
        raise GuardianAgentUnavailableError("Thiếu GROQ_API_KEY cho Guardian risk agent")

    try:
        response = OpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
            # The realtime stream must tolerate a transient 429/5xx or short
            # network flap without turning one chunk into a scam alert.
            max_retries=2,
            timeout=20.0,
        ).chat.completions.create(
            model=settings.guardian_agent_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        _conversation_payload(state, latest_text),
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0,
            max_completion_tokens=400,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise GuardianAgentUnavailableError(
            "Không thể gọi Guardian risk agent",
            retry_after_seconds=_retry_after_seconds(exc),
        ) from exc

    decision = _parse_json(_response_text(response))
    return GuardianRiskResult(
        risk_score=decision.risk_score,
        risk_level=decision.risk_level,
        scenario=decision.scenario,
        recommended_action=decision.recommended_action,
        explanation=decision.explanation,
        signals=tuple(
            GuardianSignal(
                signal_type=signal.signal_type,
                weight=signal.weight,
                confidence=signal.confidence,
                evidence=signal.evidence,
            )
            for signal in decision.signals
        ),
    )


def _retry_after_seconds(exc: Exception) -> float:
    """Extract provider backoff without exposing response bodies or secrets."""

    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is not None:
        try:
            value = headers.get("retry-after") or headers.get("Retry-After")
            if value is not None:
                return min(300.0, max(1.0, float(value)))
        except (TypeError, ValueError):
            pass
    status_code = getattr(exc, "status_code", None)
    message = str(exc).lower()
    if status_code == 429 or "rate limit" in message or "rate_limit" in message:
        match = re.search(
            r"try again in\s*(?:(\d+)m)?\s*(\d+(?:\.\d+)?)s",
            message,
        )
        if match:
            minutes = float(match.group(1) or 0)
            seconds = float(match.group(2))
            return min(300.0, max(1.0, minutes * 60 + seconds))
        # Groq may omit Retry-After for daily token quotas. Avoid hammering it.
        return 60.0
    return 0.0


def fail_closed_guardian_result(reason: str) -> GuardianRiskResult:
    """Return a safe emergency decision when the agent is unavailable.

    This is not a substitute risk model and does not calculate a threshold.
    It is an explicit fail-closed safety action: backend may pause/stop a
    dangerous transaction until an agent decision is available again.
    """

    return _agent_unavailable_result(reason, stop=True)


def degraded_guardian_result(reason: str) -> GuardianRiskResult:
    """Represent a short provider outage without raising a critical alert."""

    return _agent_unavailable_result(reason, stop=False)


def _agent_unavailable_result(reason: str, *, stop: bool) -> GuardianRiskResult:
    action = "STOP" if stop else "PAUSE"
    level = "critical" if stop else "high"
    return GuardianRiskResult(
        risk_score=100,
        risk_level=level,
        scenario="agent_unavailable",
        recommended_action=action,
        explanation=(
            "Guardian Risk Agent tạm thời không phản hồi; hệ thống tạm dừng "
            f"để bảo vệ giao dịch ({reason})."
        ),
        signals=(
            GuardianSignal(
                signal_type="agent_unavailable",
                weight=100,
                confidence=1.0,
                evidence="agent_unavailable",
            ),
        ),
    )
