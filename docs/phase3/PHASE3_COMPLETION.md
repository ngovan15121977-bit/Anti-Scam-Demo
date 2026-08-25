# Phase 3 Completion Report — Bank Risk Manager

**Branch:** `huan`  
**Date:** 2026-08-25  
**Status:** DONE (MVP production-wire stable)

## Mục tiêu Phase 3 (roadmap)

Manager có tư duy quản lý: memory, khung 5 câu hỏi, HITL feedback, multi-step, RAG light, escalation.

## Deliverables

| Hạng mục | Path | Ghi chú |
|----------|------|---------|
| Multi-step reasoning | `src/app/services/risk_manager/phase3/reasoning.py` | Extract → memory/RAG/critique → Final → escalate → record |
| Session + user memory | `phase3/memory.py` | Persist JSON (`eval/results/manager_memory.json`), tier elevated/high |
| Escalation | `phase3/escalation.py` | low conf, HITL, conflict, progressive |
| HITL feedback | `phase3/feedback.py` + `POST /api/v1/risk-manager/hitl-feedback` | JSONL, agree_rate hint |
| RAG light | `phase3/rag_light.py` | 12 seed pattern VN |
| Prompt Manager | `prompts/manager_v0.2.yaml` | Khung 5 câu hỏi + few-shot Phase 3 |
| Wire production | `integration.py` | Guardian + Transaction overlay, `[Manager: …]` |
| Config | `risk_manager_enabled`, `use_llm`, `phase3`, `manager_prompt_version=0.2` | |
| Eval | `eval/dataset/manager_phase3_cases_v0.json` (18) | `run_phase3_eval.py`, `run_phase3_smoke.py` |
| Status API | `GET /api/v1/risk-manager/status` | |

## Metrics (eval)

| Suite | Mode | Result |
|-------|------|--------|
| Manager mock (8 cases) | deterministic | 8/8 |
| Manager mock (8 cases) | LLM (local) | 8/8 (user-reported) |
| Phase 3 eval (18 cases) | deterministic | 18/18 |
| Phase 3 eval (18 cases) | LLM (local) | PASS (user-reported progressive) |
| Production assess | live | `explanation` contains `[Manager: …]` |

## Nguyên tắc bất biến (giữ)

1. LLM không tool thực thi  
2. Fail-closed + max-severity floor  
3. Backend + HITL quyền lực cuối  
4. Tiếng Việt / kịch bản VN trọng tâm  

## Giới hạn còn lại (chuyển Phase 4)

- Memory file-local (chưa Redis/DB multi-instance)
- RAG keyword seed (chưa pgvector + blacklist DB)
- Chưa CI bắt buộc mỗi PR
- Chưa A/B prompt/model + cost/latency dashboard đầy đủ
- Dual legacy paths (`src/api` vs `src/app`) cần dọn

## Cách bật

```bash
RISK_MANAGER_ENABLED=true
RISK_MANAGER_USE_LLM=true
RISK_MANAGER_PHASE3=true
MANAGER_PROMPT_VERSION=0.2
```

Verify:

```bash
python eval/scripts/run_phase3_smoke.py
python eval/scripts/run_phase3_eval.py
GET /api/v1/risk-manager/status
# Assess blacklist → explanation có [Manager:
```

## Kết luận

Phase 3 **ổn định cho demo + wire production**. Đủ điều kiện chuyển **Phase 4 (tối ưu & production-ready)**.
