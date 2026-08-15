# Manual evaluation evidence

Chạy các case này trên Docker với tài khoản test, không dùng dữ liệu thật. Đặt `LLM_EXPLANATION_ENABLED=true` để kiểm tra output LLM thật; score vẫn phải do rule engine trả về.

| # | Input | Output cần ghi nhận |
|---|---|---|
| 1 | Người nhận mới, 50.000 VND, note bình thường | `safe`/`low`, không blacklist signal, vẫn yêu cầu PIN |
| 2 | Người nhận mới, số tiền cao hơn lịch sử | `medium`/`high`, signal `unusual_amount`, xuất hiện HITL |
| 3 | Note `phi mo khoa`, `chuyen gap`, giữ bí mật | `medium`/`high`, suspicious/scam pattern evidence, không chuyển ngay |
| 4 | Tài khoản exact blacklist match | `high`, `blacklist_exact_match`, warning hiển thị source/evidence |
| 5 | Recipient trusted, note bình thường | score giảm false positive; trusted không override exact blacklist |
| 6 | Tài khoản test có ít nhất 3 giao dịch hoàn tất khoảng 500.000 VND trong 90 ngày; chuyển 50.000.000 VND cho người nhận mới | `behavioral_amount_anomaly` và `new_payee`; `high`, yêu cầu HITL |
| 7 | Hoàn tất 9 giao dịch đến 9 người nhận khác nhau trong 5 phút, sau đó tạo giao dịch thứ 10 đến người nhận mới | `transaction_velocity`; `high`, không cho chuyển thẳng |
| 8 | Note: `công an yêu cầu mã OTP để hoàn tiền` | `scam_keyword`, evidence có các category tương ứng; có cảnh báo theo tổng score |
| 9 | Đăng nhập tại Hà Nội; sau đó ở màn xác nhận vị trí, cấp vị trí Hà Nội. Đăng xuất, rồi trong dưới 15 phút mô phỏng vị trí Campuchia bằng Chrome DevTools Sensors và đổi device ID trong Local Storage trước khi đăng nhập lại | Sau khi login thành công, ứng dụng bắt buộc mở màn xác nhận vị trí; không thể tiếp tục các trang chức năng khi chưa cấp quyền; audit log login mới có `new_device` và `impossible_travel` khi đủ điều kiện |

## Quy trình ghi output thực tế

1. `docker compose -f docker-compose.dev.yml up -d --build`.
2. Đăng ký tài khoản test và tạo PIN tại `/setup-pin`.
3. Thực hiện từng case trong UI.
4. Lưu response JSON/screenshot đã che account, email, token và key vào `eval/results/`.
5. Ghi `risk_level`, `risk_score`, signals, `llm_used`, latency và quyết định cuối cùng.

Với case 9, chỉ cấp vị trí trên tài khoản test. Xác minh database chỉ có `device_hash`, `ip_hash`, `geo_lat_e2`, `geo_lon_e2`; không lưu device ID/IP gốc hoặc tọa độ chính xác.

## Automated baseline

```text
python -m pytest tests/test_agents -q
7 passed
```

Các test hiện có bao phủ weak-signal guard, high risk với hai strong signals, trusted-recipient false-positive guard, exact blacklist và policy promotion.
