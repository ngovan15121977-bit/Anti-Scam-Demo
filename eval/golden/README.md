# Golden Dataset — Timi Anti-Scam

Bộ case cố định để đánh giá transaction risk, guardian call, seasonal và url safety.
# Mai làm
## Suites

| Suite | File | Mô tả |
|-------|------|--------|
| transaction | `transaction/cases.jsonl` | Assess chuyển tiền (rule score, HITL) |
| guardian | `guardian/cases.jsonl` | Call realtime (action STOP/PAUSE/...) |
| seasonal | `seasonal/cases.jsonl` | Mùa lễ VN + stricter |
| url_safety | `url_safety/cases.jsonl` | QR / domain blacklist |
| security_login | `security_login/cases.jsonl` | Device / geo (chủ yếu manual) |

## Format

Mỗi dòng trong `cases.jsonl` là một JSON object (xem `schema/case.schema.json`).

## Chạy validate

```bash
python eval/runners/validate_schema.py