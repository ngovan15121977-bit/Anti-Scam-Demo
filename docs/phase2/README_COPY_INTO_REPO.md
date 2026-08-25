# Phase 2 deliverables — copy vào repo Anti-Scam-Demo

**Branch khuyến nghị:** `tuananh-dev-rieng`  
**Đã làm (A1–A3 + skeleton B1/B2):** schema, prompt Manager, 8 mock cases, mock runner, risk_manager package + adapters.

## 1. Copy file vào đúng path

| File trong bundle này | Path trong repo |
|----------------------|-----------------|
| `docs/phase2/manager_schema.md` | `docs/phase2/manager_schema.md` |
| `schemas/manager_recommendation.json` | `schemas/manager_recommendation.json` (hoặc `docs/phase2/`) |
| `prompts/manager_v0.1.yaml` | `prompts/manager_v0.1.yaml` |
| `eval/dataset/manager_cases_v0.json` | `eval/dataset/manager_cases_v0.json` |
| `eval/scripts/run_manager_mock.py` | `eval/scripts/run_manager_mock.py` |
| `src/app/services/risk_manager/**` | `src/app/services/risk_manager/**` |

Cập nhật thêm:
- `prompts/README.md` — thêm hàng `manager_v0.1`
- `ROADMAP.md` — checklist A1–A3 → ✅ khi đã chạy mock
- `JOURNAL.md` — ghi ngày + kết quả mock

## 2. Chạy mock (không cần wire production)

```bash
# Từ root repo, sau khi copy

# Không cần API key — kiểm tra policy max-severity + fail-closed
python eval/scripts/run_manager_mock.py --deterministic

# Có GROQ_API_KEY — chạy LLM Manager thật
export GROQ_API_KEY=gsk_...
python eval/scripts/run_manager_mock.py

# Một case
python eval/scripts/run_manager_mock.py --deterministic --case mgr-001-guardian-stop-otp
```

**Kỳ vọng:** case mâu thuẫn (mgr-001) không ra CONTINUE; guardian unavailable (mgr-005) → PAUSE + escalate.

## 3. Dependency

- `pydantic` (repo đã có)
- `pyyaml` (repo đã có cho guardian prompts)
- `openai` (Groq compatible) khi chạy LLM mode

## 4. Việc tiếp theo (thứ tự)

1. Chạy `--deterministic` → sửa case/policy nếu FAIL  
2. Chạy LLM mode → ghi schema OK rate  
3. Wire adapter thật: gọi `map_guardian_result` từ output `scam_guardian_agent` / hybrid  
4. Wire `map_transaction_result` từ assess / `risk_rules`  
5. Backend gate: chỉ áp dụng action sau `validate_manager_output` + `apply_safety_floor`  
6. **Chưa** self-ask / LangGraph multi-node production (B3)

## 5. Nguyên tắc giữ vững

1. LLM không tool thực thi  
2. Fail-closed  
3. Max severity (giảm FN)  
4. Số liệu trước/sau mỗi đổi prompt  
5. Backend + HITL cầm quyền cuối  
