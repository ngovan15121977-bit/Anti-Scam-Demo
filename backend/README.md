# Chạy Backend và PostgreSQL

Backend dùng schema Alembic tại thư mục gốc. Không chạy đồng thời một file SQL
tạo cùng các bảng với `alembic upgrade head`.

1. Tạo database local (chạy trong PowerShell, dùng user PostgreSQL của bạn):

```powershell
psql -U postgres -d postgres -c "CREATE USER antiscam WITH PASSWORD 'antiscam';"
psql -U postgres -d postgres -c "CREATE DATABASE antiscam OWNER antiscam;"
```

2. Đặt trong file `.env` ở root project:

```dotenv
DATABASE_URL=postgresql+psycopg2://antiscam:antiscam@localhost:5432/antiscam
JWT_SECRET_KEY=replace-with-a-long-random-value
```

3. Cài dependency và tạo schema, từ thư mục gốc project:

```powershell
python -m pip install -r backend\requirements.txt
alembic upgrade head
```

4. Chạy API:

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Swagger: `http://localhost:8000/docs`.

## Tự động tra cứu tên người nhận

Form chuyển tiền gọi `POST /api/v1/recipients/resolve` sau khi người dùng chọn
ngân hàng và nhập đủ số tài khoản. Backend chỉ tra cứu trong PostgreSQL theo
thứ tự `recipient_directory`, `blacklist`, rồi `trusted_recipients` của chính
user; không gọi API ngân hàng bên ngoài.

Để thêm tài khoản cho demo, sau khi chạy `alembic upgrade head`, dùng SQL:

```sql
INSERT INTO recipient_directory (account_number, bank_code, account_name, source)
VALUES ('123456789', 'VCB', 'NGUYEN VAN A', 'demo')
ON CONFLICT (account_number, bank_code)
DO UPDATE SET account_name = EXCLUDED.account_name, source = EXCLUDED.source;
```

Nếu không có bản ghi khớp chính xác cả số tài khoản và ngân hàng, API trả `404`
và không cho tạo giao dịch chưa có tên trong dữ liệu nội bộ.

## Import SQL hoặc Excel

- File `.sql` chỉ chứa dữ liệu `INSERT`: chạy **sau** Alembic:

```powershell
psql -U antiscam -d antiscam -h localhost -p 5432 -f "C:\duong-dan\data.sql"
```

- File `.sql` có `CREATE TABLE` cho các bảng trên: chọn **một** trong hai,
  không chạy file đó cùng migration hiện tại. Migration này là baseline chuẩn
  cho database mới.

- Import Excel blacklist có sẵn:

```powershell
cd backend
python import_scams.py --file scams-done.xlsx
```
