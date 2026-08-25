# Phase 3 Status — Memory + Multi-step + RAG + Feedback

**Branch:** `huan` · **Date:** 2026-08-25

## Delivered (A→D)

### A. Manager prompt v0.2
- `prompts/manager_v0.2.yaml` — khung 5 câu hỏi, policy max-severity, 8 few-shot Phase 3 (progressive, RAG, conflict).
- Default: `MANAGER_PROMPT_VERSION=0.2` / `manager_prompt_version` in Settings.
- `run_manager_llm` defaults to v0.2.

### B. Wire production path
- `integration.py` gọi `run_multistep_manager` khi `risk_manager_enabled` + `risk_manager_phase3`.
- Guardian WebSocket (`routers/api/guardian.py`): overlay trước `_persist_risk_result`.
- Transaction assess (`routers/api/transactions.py`): overlay sau graph + active guardian.
- Flags (default Manager **OFF** để an toàn):
  - `RISK_MANAGER_ENABLED=true`
  - `RISK_MANAGER_USE_LLM=true|false`
  - `RISK_MANAGER_PHASE3=true` (default True khi Settings load)
  - `MANAGER_PROMPT_VERSION=0.2`

### C. RAG light + HITL API
- `phase3/rag_light.py` — 10 seed pattern VN (OTP, công an, TK an toàn, remote, blacklist, đầu tư, ship, secrecy, credential, urgency).
- API:
  - `POST /api/v1/risk-manager/hitl-feedback`
  - `GET /api/v1/risk-manager/status`

### D. Eval
- Dataset: `eval/dataset/manager_phase3_cases_v0.json` (18 cases: progressive, conflict, unavailable, RAG-ish, safe).
- Runner: `python eval/scripts/run_phase3_eval.py` (deterministic mặc định).
- Smoke: `python eval/scripts/run_phase3_smoke.py`

## Nguyên tắc bất biến
1. LLM không tool thực thi  
2. Fail-closed + max severity  
3. Backend + HITL quyền lực cuối  
4. Mọi đổi agent nên có số liệu eval  

## Next (optional)
- Persist memory store (Redis/DB)
- pgvector RAG thay keyword seed
- UI Mini Timi hiện rationale Manager + nút HITL feedback
- CI chạy `run_phase3_eval.py` mỗi PR
