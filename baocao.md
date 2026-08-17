# Báo Cáo Các Hạng Mục Bổ Sung

## 1. Database và Migration

- Bổ sung bảng `recipient_directory` để lưu ánh xạ `số tài khoản + bank_code -> tên chủ tài khoản`.
- Bổ sung các migration để tạo bảng này đúng schema cấu hình, ví dụ `antiscam`, thay vì bị tạo nhầm trong `public`.
- Cập nhật Alembic sử dụng `DATABASE_SCHEMA` và `search_path` của ứng dụng.
- Hoàn thiện schema cho luồng đánh giá rủi ro, cảnh báo, quyết định người dùng, audit và compliance.

## 2. Tự Tra Tên Tài Khoản Nội Bộ

- Thêm API `POST /api/v1/recipients/resolve`.
- Tra cứu theo cặp chính xác `account_number` và `bank_code`, theo thứ tự:
  1. `recipient_directory`
  2. `blacklist`
  3. `trusted_recipients` của người dùng hiện tại
- Không gọi API ngân hàng thật.
- Nếu không có dữ liệu khớp, API trả `404` và không cho tiếp tục đánh giá giao dịch.
- Tạo token xác minh ngắn hạn sau khi tra cứu; API đánh giá giao dịch chỉ tin tên người nhận đã được backend xác thực.

## 3. Luồng Giao Dịch và Rủi Ro

- Giao dịch được lưu trong `transactions`.
- Mỗi lần kiểm tra tạo kết quả tại `transaction_risk_assessments`.
- Các dấu hiệu cụ thể được lưu trong `risk_signals`.
- Với rủi ro `medium` hoặc `high`, hệ thống tạo `transaction_warnings`.
- Quyết định tiếp tục hoặc hủy được lưu lại; giao dịch hoàn tất có trạng thái `completed`, giao dịch hủy có trạng thái `cancelled`.
- Dấu vết kiểm tra và quyết định được lưu trong `audit_logs` và `intervention_logs`.
- Luồng hiện tại là sandbox:`users.balance`

## 4. Giao Diện Chuyển Tiền

- Bỏ nhập tay tên người nhận; tên được hiển thị từ dữ liệu nội bộ sau khi nhập số tài khoản và chọn ngân hàng.
- Bổ sung thêm 40 `bank_code`
- Đổi chọn ngân hàng thành combobox:
  - Gõ tên hoặc mã ngân hàng để lọc nhanh.
  - Danh sách kết quả xổ xuống dưới ô nhập.
  - Khi đổi ngân hàng, tên tài khoản và token cũ bị xóa để tránh dùng sai dữ liệu.

## 5. Tài Liệu và Kiểm Tra

- `python -m compileall app` đã chạy thành công.
- `git diff --check` không có lỗi định dạng.
