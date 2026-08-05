import psycopg2

conn = psycopg2.connect(
    dbname="postgres",
    user="postgres",
    password="070405",
    host="localhost",
    port="5432"
)
conn.autocommit = True
cursor = conn.cursor()

# Kiểm tra DB đã tồn tại chưa
cursor.execute("SELECT 1 FROM pg_database WHERE datname='fintechguard'")
exists = cursor.fetchone()

if not exists:
    cursor.execute("CREATE DATABASE fintechguard;")
    print("✅ Database 'fintechguard' created!")
else:
    print("ℹ️ Database 'fintechguard' already exists.")

cursor.close()
conn.close()