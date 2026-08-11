# FintechGuard — AI Agent chống lừa đảo chuyển tiền

FintechGuard là ứng dụng React + FastAPI giúp kiểm tra giao dịch trước khi chuyển tiền. LangGraph điều phối flow; Rule Engine/ML tạo risk score, còn LLM chỉ giải thích evidence và hướng dẫn người dùng. LLM không được tự chấm điểm và không được tự chuyển tiền.

## User flow chính

1. Đăng ký/đăng nhập và tạo PIN giao dịch.
2. Nhập tài khoản, ngân hàng, số tiền và nội dung chuyển khoản.
3. Backend xác thực recipient lookup token rồi chạy `guard_input → collect_evidence → score → explain`.
4. Evidence gồm blacklist, scam pattern/vector, người nhận mới, số tiền bất thường, note đáng ngờ, lịch sử và trusted recipient.
5. LOW/SAFE vẫn cần PIN. MEDIUM/HIGH phải qua HITL 2 bước, countdown, xác minh độc lập và PIN.
6. Backend ghi risk assessment, signals, intervention log và audit log.

## Chạy nhanh

```powershell
Copy-Item .env.example .env
# Điền DATABASE_URL, DATABASE_URL_UNPOOLED và OPENAI_API_KEY
docker compose -f docker-compose.dev.yml up -d --build
```

- Frontend: http://localhost:5173
- API/Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

Production: `docker compose up -d --build`.

Chi tiết migration, Neon schema và troubleshooting: [SETUP.md](SETUP.md).

## Environment variables

| Variable | Required | Meaning |
|---|---:|---|
| `DATABASE_URL` | Yes | URL runtime, thường là Neon pooled URL |
| `DATABASE_URL_UNPOOLED` | Recommended | URL direct cho Alembic migration |
| `DATABASE_SCHEMA` | Yes | Schema PostgreSQL, ví dụ `antiscam` |
| `OPENAI_API_KEY` | LLM demo | OpenAI API key, không commit vào Git |
| `MODEL_NAME` | No | Mặc định `gpt-4o-mini` |
| `LLM_EXPLANATION_ENABLED` | No | `true` để bật LLM thật |
| `JWT_SECRET_KEY` | Production | Secret JWT riêng của môi trường deploy |

Mặc định score vẫn deterministic để nhanh và an toàn. Demo LLM thật:

```env
OPENAI_API_KEY=your-real-key
LLM_EXPLANATION_ENABLED=true
```

## API sample

```bash
curl -X PUT http://localhost:8000/api/v1/auth/transaction-pin \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"pin":"2468"}'
```

```bash
curl -X POST http://localhost:8000/api/v1/transactions/assess \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"payee_account":"123456789","bank_code":"VCB","recipient_lookup_token":"LOOKUP_TOKEN","amount":2000000,"note":"phi mo khoa"}'
```

## Architecture, eval và test

- Sơ đồ components/data flow: [ARCHITECTURE.md](ARCHITECTURE.md)
- Manual evaluation cases: [eval/manual_cases.md](eval/manual_cases.md)
- Automated tests: `tests/`

```powershell
python -m pytest -q
cd frontend; npm run build
```

Video MVP 3 phút phải được ghi từ môi trường chạy thật với API key thật; PR merged chỉ xác nhận trên GitHub Pull Requests, không suy ra từ commit local.
