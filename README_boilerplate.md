# [FIN-19] Timi — FintechGuard Anti-Scam Demo

> Ứng dụng ngân hàng mô phỏng dùng AI để phát hiện, giải thích và ngăn các giao dịch có dấu hiệu lừa đảo trước khi người dùng xác nhận chuyển tiền.

## Vấn đề (Problem)

Lừa đảo chuyển khoản thường khai thác sự gấp gáp, giả danh ngân hàng/cơ quan chức năng, yêu cầu cung cấp OTP hoặc hướng người dùng tới các đường dẫn độc hại. Người dùng thường phải tự đánh giá rủi ro trong vài giây, trong khi các ứng dụng chuyển tiền thông thường chưa cung cấp đủ ngữ cảnh và cảnh báo dễ hiểu.

Các vấn đề chính:

- Người dùng khó nhận biết người nhận, nội dung chuyển tiền hoặc URL QR có dấu hiệu bất thường.
- Cảnh báo đơn lẻ thường thiếu bằng chứng và không giải thích rõ vì sao giao dịch nguy hiểm.
- Các cuộc gọi lừa đảo có thể thao túng người dùng trước hoặc trong lúc thực hiện giao dịch.
- Việc xác thực bổ sung như PIN, Face ID và quy trình dừng giao dịch chưa được kết hợp thành một luồng thống nhất.

## Giải pháp (Solution)

Timi là một ngân hàng mô phỏng nội bộ, kết hợp rule engine, dữ liệu lịch sử và AI agent để hỗ trợ người dùng ra quyết định an toàn. Hệ thống không tự ý chuyển tiền và không kết nối hệ thống ngân hàng thật.

Các chức năng chính:

- **Đánh giá rủi ro giao dịch:** phân tích số tiền, người nhận, tần suất, thiết bị/IP, từ khóa đáng ngờ và blacklist.
- **Cảnh báo có giải thích:** hiển thị risk score, mức độ rủi ro, tín hiệu phát hiện và khuyến nghị tiếp tục hoặc hủy.
- **Scam Call Guardian:** nhận transcript cuộc gọi theo thời gian thực, phát hiện các dấu hiệu giả danh, ép buộc, xin OTP/PIN và đưa ra hành động `CONTINUE`, `MONITOR`, `PAUSE` hoặc `STOP`.
- **Bảo vệ QR và URL:** quét QR, kiểm tra hostname với danh sách URL/domain lừa đảo và chặn đường dẫn nguy hiểm.
- **Xác thực giao dịch:** hỗ trợ PIN giao dịch, Face ID cho giao dịch giá trị cao và quy trình Human-in-the-Loop.
- **Audit và quản trị:** lưu risk event, quyết định, báo cáo scam và lịch sử để phục vụ kiểm tra.

## Target User

- **Primary:** người dùng ngân hàng số cần được hỗ trợ trước khi chuyển tiền hoặc mở URL từ QR.
- **Secondary:** nhóm vận hành/quản trị cần theo dõi blacklist, báo cáo scam, audit log và kết quả đánh giá rủi ro.

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | LangGraph, Groq/OpenAI-compatible API, Whisper STT tùy cấu hình |
| Backend | FastAPI, Python 3.11+, SQLAlchemy, Pydantic |
| Frontend | React, Vite, JavaScript/JSX, Tailwind CSS |
| Database | PostgreSQL/Neon, Alembic migrations, schema `antiscam` |
| Computer Vision | OpenCV Zoo SFace + YuNet cho Face ID |
| Realtime | WebSocket, MediaRecorder API |
| DevOps | Docker, Docker Compose, Nginx, Render tùy môi trường |
| Testing | Pytest, Ruff, ESLint, Vite build |

## Quick Start

### Yêu cầu

- Python 3.11+.
- Node.js 20+ và npm.
- PostgreSQL/Neon PostgreSQL.
- Docker Desktop nếu chạy bằng Docker.
- Hai model Face ID trong `models/face/` nếu sử dụng nhận diện khuôn mặt.

### Chạy local không Docker

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Cập nhật DATABASE_URL, DATABASE_SCHEMA, JWT_SECRET_KEY và GROQ_API_KEY trong .env
python -m alembic upgrade head
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

Mở terminal khác để chạy frontend:

```powershell
Set-Location frontend
npm ci
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health

### Chạy bằng Docker

```powershell
Copy-Item .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Hướng dẫn cấu hình Neon, migration, deploy Render và xử lý lỗi chi tiết nằm trong [SETUP.md](SETUP.md).

> Không commit `.env`, API key, JWT secret hoặc secret production vào Git.

## Project Structure

```text
├── src/
│   ├── app/                 # FastAPI app, API, models, schemas, services chính
│   ├── agents/              # LangGraph transaction/intervention/risk graphs
│   ├── main.py              # Entrypoint Uvicorn
│   └── services/            # Một số service dùng chung/legacy
├── frontend/                # React/Vite frontend
├── alembic/                 # Database migrations
├── models/face/             # Model ONNX cho Face ID
├── data/uploads/            # Dữ liệu upload và blacklist local
├── tests/                   # Unit và integration tests
├── eval/                    # Manual cases và evaluation results
├── docs/                    # Tài liệu kỹ thuật
├── ARCHITECTURE.md          # Kiến trúc và safety boundary
├── SETUP.md                 # Hướng dẫn chạy và deploy
├── Dockerfile               # Backend production image
├── docker-compose.yml       # Production-like stack
└── docker-compose.dev.yml   # Development hot reload stack
```

## API Endpoints chính

Các endpoint dưới đây thường nằm dưới `/api/v1` và yêu cầu JWT, ngoại trừ health check:

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Đăng ký tài khoản Timi |
| POST | `/auth/login` | Đăng nhập và nhận JWT |
| POST | `/recipients/resolve` | Tra cứu người nhận |
| POST | `/transactions/assess` | Đánh giá rủi ro trước giao dịch |
| POST | `/transactions/{id}/decision` | Tiếp tục hoặc hủy giao dịch cảnh báo |
| GET | `/transactions/history` | Xem lịch sử giao dịch |
| POST | `/url-safety/check` | Kiểm tra URL/hostname đáng ngờ |
| POST | `/assistant/chat` | Chat với Timi Assistant |
| POST | `/scam-guardian/sessions` | Tạo phiên Scam Guardian |
| WS | `/scam-guardian/ws/{session_id}` | Nhận transcript và risk update realtime |
| GET | `/health` | Liveness check |
| GET | `/health/ready` | Readiness check có kiểm tra database |

## Kiểm thử

```powershell
\.venv\Scripts\python.exe -m pytest tests -q
\.venv\Scripts\python.exe -m ruff check src tests
npm --prefix frontend run build
npm --prefix frontend run lint
```

## Deliverables Checklist

- [x] Source code
- [x] README và hướng dẫn setup
- [x] Architecture document (`ARCHITECTURE.md`)
- [x] AI logs (`.ai-log/` khi được cấu hình)
- [x] Weekly journal (`JOURNAL.md`)
- [x] Worklog (`WORKLOG.md`)
- [x] Evaluation cases/results (`eval/`)
- [x] Live URL / deployment chính thức
- [x] Video demo
- [ ] Pitch deck hoàn thiện

## Team

| Thành viên | Vai trò | Mã sinh viên |
|---|---|---|
| Nguyễn Ngọc Huân | Full-stack Developer; DevOps & Docker; Testing/QA; AI Agent, Database | 2A202601164 |
| Lý Thành Đạt | Full-stack Developer; AI Agent, Database, Testing/QA; | 2A202601469 |
| Nguyễn Vũ Việt Anh | Thành viên phát triển |  |
| Nguyễn Văn Tuấn Anh | Thành viên phát triển |  |

## Giới hạn và an toàn

- Đây là MVP/demo giáo dục, không sử dụng cho tiền thật hoặc quyết định tài chính thực tế.
- AI agent chỉ hỗ trợ đánh giá và cảnh báo; không được cấp quyền tự thay đổi số dư hoặc tự phê duyệt giao dịch.
- Không đưa OTP, PIN, mật khẩu, API key hay dữ liệu nhạy cảm vào nội dung chat/log.
- Secret phải được lưu trong biến môi trường hoặc secret manager; dữ liệu Face ID và telemetry cần được bảo vệ khi triển khai thật.

## Tài liệu liên quan

- [README.md](README.md) — tài liệu dự án đầy đủ
- [SETUP.md](SETUP.md) — hướng dẫn chạy Docker, Neon và Render
- [ARCHITECTURE.md](ARCHITECTURE.md) — kiến trúc và ranh giới an toàn
- [eval/manual_cases.md](eval/manual_cases.md) — các ca đánh giá thủ công
- [JOURNAL.md](JOURNAL.md) — nhật ký theo tuần
- [WORKLOG.md](WORKLOG.md) — nhật ký công việc

## License

MIT
