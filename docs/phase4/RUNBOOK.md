# Runbook vận hành — Timi / FintechGuard (Phase 4)

## 1. Health

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/
```

## 2. Risk Manager status

Cần JWT user đã login:

```bash
curl -s http://localhost:8000/api/v1/risk-manager/status \
  -H "Authorization: Bearer <TOKEN>"
```

Kiểm tra:

- `risk_manager_enabled: true`
- `metrics.calls` tăng sau assess / Guardian
- `metrics.skips` không tăng đột biến
- `metrics.action_distribution`

## 3. Manager không hiện `[Manager:]` trên assess

1. Flag: `RISK_MANAGER_ENABLED=true` → restart API  
2. Import: `python -c "from src.app.services.risk_manager.integration import maybe_apply_manager_to_transaction"`  
3. Log: tìm `Manager overlay skipped`  
4. File `integration.py` không được là bản copy transactions router  

## 4. Fail-closed

- LLM lỗi → deterministic / PAUSE  
- Schema invalid → PAUSE + escalate  
- 3 lỗi Guardian liên tiếp → STOP (Guardian path)  

## 5. HITL feedback

```bash
POST /api/v1/risk-manager/hitl-feedback
```

Không auto-đổi policy; chỉ ghi JSONL + gợi ý calibration.

## 6. Eval trước khi merge

```bash
python eval/scripts/run_manager_mock.py --deterministic
python eval/scripts/run_phase3_smoke.py
python eval/scripts/run_phase3_eval.py
```

CI: workflow `manager-eval.yml`.

## 7. Load probe nhẹ

```bash
python scripts/load_test_health.py --base http://localhost:8000 --n 50 --concurrency 10
```

## 8. Sự cố thường gặp

| Triệu chứng | Hướng xử lý |
|-------------|-------------|
| 429 Groq | Backup keys / tăng interval Guardian / `RISK_MANAGER_USE_LLM=false` tạm |
| STT hallucination | Filter YouTube outro; fail-closed PAUSE |
| Memory mất sau restart multi-instance | File persist local — Phase 4 tiếp: Redis |
| Face ID fail | Kiểm tra ONNX path + liveness threshold |

## 9. Nguyên tắc bất biến

1. LLM không tool thực thi  
2. Fail-closed  
3. Backend + HITL quyền lực cuối  
4. Ưu tiên giảm false negative  
