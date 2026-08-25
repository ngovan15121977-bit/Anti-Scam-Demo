# Phase 4 — Tối ưu & Production-ready (kickoff)

**Date:** 2026-08-25 · **After:** Phase 3 DONE

## Đã giao trong kickoff này

| Hạng mục | Path |
|----------|------|
| CI eval mỗi PR/push | `.github/workflows/manager-eval.yml` |
| Manager metrics | `src/app/services/risk_manager/metrics.py` |
| Metrics trên status API | `GET /api/v1/risk-manager/status` → `metrics` |
| Load probe health | `scripts/load_test_health.py` |
| Runbook sự cố | `docs/phase4/RUNBOOK.md` |

## Việc còn lại (liên tục)

- [ ] Dọn dual path `src/api/*` vs `src/app/*` (legacy)
- [ ] A/B prompt/model (`MANAGER_PROMPT_VERSION`, `MANAGER_MODEL`)
- [ ] Cost tracking token (log provider usage)
- [ ] Alerting (Prometheus/Grafana hoặc log-based)
- [ ] Load test WebSocket + STT thật
- [ ] Memory Redis; RAG pgvector
- [ ] CI gate fail PR nếu eval < 100% deterministic

## Flags

```bash
RISK_MANAGER_ENABLED=true
RISK_MANAGER_USE_LLM=true
RISK_MANAGER_PHASE3=true
MANAGER_PROMPT_VERSION=0.2
```
