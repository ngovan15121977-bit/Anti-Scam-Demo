# Guardian Prompts

Versioned system prompts for the Scam Guardian Risk Agent.

| File | Version | Notes |
|------|---------|-------|
| `guardian_v0.1.yaml` | 0.1 | Exact extract from current production code (`scam_guardian_agent.py`) |
| `guardian_v0.2.yaml` | 0.2 | Improved: few-shot, evidence requirement, clearer guidance |
| `guardian_v0.3.yaml` | 0.3 | **Default since Phase 1.** 12 few-shot incl. `otp_ambiguous`→PAUSE and `safe_account_scam`→STOP, `decision_confidence`, urgency-only→MONITOR (MONITOR-2) |
| `manager_v0.1.yaml` | 0.1 | **Phase 2.** Bank Risk Manager — tổng hợp specialist packs → khuyến nghị mức quản lý (không tool thực thi). Mock LLM 8/8 PASS (`openai/gpt-oss-20b`) |

## Rules

- Never edit an existing version file after it has been used in evaluation.
- Create a new version (`v0.3`, `v0.4`...) for every meaningful change.
- Record the version used in every evaluation report and in production logs.

## Manager (Phase 2)

- Load: `prompts/manager_v0.1.yaml`
- Mock: `python eval/scripts/run_manager_mock.py` (cần `GROQ_API_KEY`; model qua `MANAGER_MODEL` hoặc `GUARDIAN_AGENT_MODEL`)
- Env ưu tiên model: `MANAGER_MODEL` > `GUARDIAN_AGENT_MODEL` > `model_recommendation` trong YAML
- `max_completion_tokens` cho Manager: 1500 (reasoning model `gpt-oss-*`)

## `max_completion_tokens` / `temperature` / `model_recommendation` are now live

Previously these keys were decorative: `scam_guardian_agent.py` only ever
read the `system_prompt` string out of the YAML and hardcoded
`max_completion_tokens=500` in the API call regardless of what the file
declared. That caused Groq 400 `json_validate_failed: max completion tokens
reached before generating a valid document` on any reasoning model
(`openai/gpt-oss-20b` etc.), because hidden reasoning tokens ate the budget
before the JSON body was emitted.

`_configured_max_completion_tokens()` in `scam_guardian_agent.py` now reads
`max_completion_tokens` from the active prompt file (floor 500, default
900 if missing/invalid). If you bump this value in a new prompt version, it
now actually changes the API call. `guardian_agent_model` in `.env` should
stay a non-reasoning model (`llama-3.1-8b-instant`) unless you deliberately
want a GPT-OSS model — the code now sets `reasoning_effort="low"`
automatically when it detects `gpt-oss` in the model name, and retries once
with a doubled budget on this specific error, but a reasoning model will
still be slower and use more tokens per call than `llama-3.1-8b-instant`.

## Loading example (Phase 1+)

```python
import yaml
from pathlib import Path

def load_guardian_prompt(version: str = "0.3") -> dict:
    path = Path(__file__).parent / f"guardian_v{version}.yaml"
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)
```

## Loading Manager (Phase 2)

```python
from src.app.services.risk_manager.manager_agent import load_manager_prompt, run_manager_llm
cfg = load_manager_prompt("0.1")
```
