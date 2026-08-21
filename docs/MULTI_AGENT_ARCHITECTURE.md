# Kiến trúc Multi-Agent của Timi

## Luồng hiện tại

```text
                         +------------------------+
API chuyên biệt -------->| MultiAgentSupervisor   |
                         | deterministic routing  |
                         +-----------+------------+
                                     |
             +----------------+----------------+----------------+
             |                |                |                |
    +--------v---------+ +----v-----------+ +--v---------------+
    | chat_support     | | call_guardian  | | task_navigator   |
    | product chat     | | STT + risk     | | draft + redirect  |
    +--------+---------+ +----+-----------+ +------------------+
             |                |
     CHAT_AGENT_*     GUARDIAN_AGENT_*/GUARDIAN_STT_*
```

Mỗi API đã biết rõ domain nên gửi thẳng `agent_id` cho Supervisor. Supervisor
không gọi LLM để phân loại lại yêu cầu, vì một lượt phân loại như vậy sẽ tăng
token, độ trễ và thêm một điểm lỗi cho mọi request.

Chat chỉ nhận câu hỏi cùng tối đa sáu lượt lịch sử chat. Call Guardian chỉ nhận
audio/transcript của phiên cuộc gọi. Task Navigator chỉ nhận tin nhắn hiện tại
và bản nháp thao tác do trình duyệt giữ theo đúng tài khoản. Context không được
chia sẻ ngầm giữa các agent.

`task_navigator` không dùng API key hay LLM. Nó có ba quyền giới hạn: hỏi các
trường còn thiếu của bản nháp chuyển tiền rồi điều hướng sang màn hình **xem
lại**; bật/tắt nghe và bảo vệ cuộc gọi khi người dùng yêu cầu trực tiếp; hoặc mở
một route nằm trong allowlist (Tổng quan, QR, lịch sử, Hồ sơ, PIN, Face ID và
đổi mật khẩu). Nó không thể tạo giao dịch, bấm xác nhận, nhập mật khẩu/PIN,
thay đổi dữ liệu tài khoản, hoặc thực thi quyền của agent khác.

## Thêm một agent mới

1. Thêm `AgentId` và `AgentCapability` trong `src/app/agents/contracts.py`.
2. Tạo task/result có kiểu rõ ràng và adapter trong `specialists.py`.
3. Đăng ký adapter một lần trong `get_multi_agent_supervisor()`.
4. Tạo endpoint chuyên biệt; endpoint chỉ gửi context tối thiểu cần thiết.
5. Thêm biến provider/model riêng và fallback nếu cần tương thích cấu hình cũ.
6. Thêm test contract, lỗi provider, giới hạn dữ liệu và quyền truy cập endpoint.

## Khi nào cần Supervisor dùng LLM

Chỉ dùng một model Supervisor khi một yêu cầu thực sự cần lập kế hoạch qua nhiều
domain, chẳng hạn vừa tra giao dịch, vừa đánh giá cuộc gọi, rồi tổng hợp giải
thích. Các endpoint chat, Guardian, Face ID hoặc transaction đã rõ domain vẫn đi
thẳng tới specialist. Kết quả của agent phải theo schema; Supervisor không được
tự thực hiện chuyển tiền, thay đổi bảo mật hay bỏ qua kiểm tra quyền.
