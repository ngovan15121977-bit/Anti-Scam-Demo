# Guardian Prompts

Versioned system prompts for the Scam Guardian Risk Agent.

| File | Version | Notes |
|------|---------|-------|
| `guardian_v0.1.yaml` | 0.1 | Exact extract from current production code (`scam_guardian_agent.py`) |
| `guardian_v0.2.yaml` | 0.2 | Improved: few-shot, evidence requirement, clearer guidance |

## Rules

- Never edit an existing version file after it has been used in evaluation.
- Create a new version (`v0.3`, `v0.4`...) for every meaningful change.
- Record the version used in every evaluation report and in production logs.

## Loading example (Phase 1+)

```python
import yaml
from pathlib import Path

def load_guardian_prompt(version: str = "0.2") -> dict:
    path = Path(__file__).parent / f"guardian_v{version}.yaml"
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)