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
