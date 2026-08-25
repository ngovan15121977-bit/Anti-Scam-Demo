# A/B Prompt / Model (Phase 4)

## Biến môi trường

| Env | Ý nghĩa |
|-----|---------|
| `MANAGER_PROMPT_VERSION` | `0.1` / `0.2` (file `prompts/manager_v{ver}.yaml`) |
| `MANAGER_MODEL` | Model LLM Manager (ưu tiên hơn GUARDIAN_AGENT_MODEL) |
| `RISK_MANAGER_USE_LLM` | `false` = deterministic only |

## Cách chạy A/B

1. Instance A: `MANAGER_PROMPT_VERSION=0.2` + model hiện tại  
2. Instance B: `MANAGER_PROMPT_VERSION=0.1` hoặc model khác  
3. So sánh:
   - `GET /api/v1/risk-manager/status` → `metrics.prompt_version_distribution`, `model_distribution`
   - Eval: `run_manager_mock.py` / `run_phase3_eval.py --llm`
4. Không merge prompt version đã dùng trong baseline — tạo `v0.3` mới

## Quan sát

- `metrics.estimated_cost_usd` — ước lượng chi phí token  
- `metrics.latency_ms_avg` / `max`  
- `metrics.skip_rate` — overlay bị bỏ qua  
