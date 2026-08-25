# LEGACY — không dùng cho production path

Thư mục `src/api/` là **legacy** (entrypoint cũ `src/legacy_main.py`).

**Canonical backend:** `src/app/` (`src/main.py` → `from src.app.main import app`).

- `src/api/*.py` — router/middleware cũ, chỉ giữ để tham chiếu / migration.
- `src/api/*.js` — client API cũ; frontend mới dùng `frontend/src/`.

Phase 4: không thêm feature mới vào đây. Xóa dần sau khi confirm không còn import.
