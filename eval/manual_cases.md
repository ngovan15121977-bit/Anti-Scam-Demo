# Manual evaluation evidence

Chạy các case này trên Docker với tài khoản test, không dùng dữ liệu thật. Đặt `LLM_EXPLANATION_ENABLED=true` để kiểm tra output LLM thật; score vẫn phải do rule engine trả về.

| # | Input | Output cần ghi nhận |
|---|---|---|
| 1 | Người nhận mới, 50.000 VND, note bình thường | `safe`/`low`, không blacklist signal, vẫn yêu cầu PIN |
| 2 | Người nhận mới, số tiền cao hơn lịch sử | `medium`/`high`, signal `unusual_amount`, xuất hiện HITL |
| 3 | Note `phi mo khoa`, `chuyen gap`, giữ bí mật | `medium`/`high`, suspicious/scam pattern evidence, không chuyển ngay |
| 4 | Tài khoản exact blacklist match | `high`, `blacklist_exact_match`, warning hiển thị source/evidence |
| 5 | Recipient trusted, note bình thường | score giảm false positive; trusted không override exact blacklist |

## Quy trình ghi output thực tế

1. `docker compose -f docker-compose.dev.yml up -d --build`.
2. Đăng ký tài khoản test và tạo PIN tại `/setup-pin`.
3. Thực hiện từng case trong UI.
4. Lưu response JSON/screenshot đã che account, email, token và key vào `eval/results/`.
5. Ghi `risk_level`, `risk_score`, signals, `llm_used`, latency và quyết định cuối cùng.

## Automated baseline

```text
python -m pytest tests/test_agents -q
7 passed
```

Các test hiện có bao phủ weak-signal guard, high risk với hai strong signals, trusted-recipient false-positive guard, exact blacklist và policy promotion.
