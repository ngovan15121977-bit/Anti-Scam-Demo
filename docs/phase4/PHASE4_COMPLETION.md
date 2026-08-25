# Phase 4 — Progress / Completion snapshot

**Branch:** `huan` · **Date:** 2026-08-25

## Done

| Hạng mục | Path / ghi chú |
|----------|----------------|
| CI eval gate 100% | `.github/workflows/manager-eval.yml` |
| Manager metrics + token/cost + alert log | `risk_manager/metrics.py` |
| Status API metrics | `GET /api/v1/risk-manager/status` |
| Token record trên LLM Manager | `manager_agent.py` |
| A/B guide | `docs/phase4/AB_TESTING.md` |
| Load health / assess / ws probe | `scripts/load_test_*.py` |
| Runbook | `docs/phase4/RUNBOOK.md` |
| Legacy marked | `src/api/LEGACY.md` + banner |
| Face anti-spoof | sẵn có `passive_liveness.py` (MiniFASNet) |

## Not full production (backlog)

- Redis memory multi-instance  
- pgvector RAG thay keyword seed  
- Prometheus/Grafana exporter  
- Xóa hẳn `src/api` + `legacy_main` sau audit import  
- Load test STT audio end-to-end trên staging  

## Verify

```bash
python eval/scripts/run_manager_mock.py --deterministic
python eval/scripts/run_phase3_eval.py
python scripts/load_test_health.py --base http://localhost:8000
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/risk-manager/status
```
