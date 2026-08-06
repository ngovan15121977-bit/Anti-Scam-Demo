import psycopg2
import pandas as pd
import uuid
import json
import math
import os

# ==================== BƯỚC 1: TẠO DATABASE ====================

def create_database():
    """Tạo database fintechguard nếu chưa tồn tại"""
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password="070405",
        host="localhost",
        port="5432"
    )
    conn.autocommit = True
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM pg_database WHERE datname='fintechguard'")
    exists = cursor.fetchone()

    if not exists:
        cursor.execute("CREATE DATABASE fintechguard;")
        print("✅ Database 'fintechguard' created!")
    else:
        print("ℹ️ Database 'fintechguard' already exists.")

    cursor.close()
    conn.close()

# ==================== BƯỚC 2: TẠO BẢNG ====================

def create_tables():
    """Tạo bảng blacklist với cột bank riêng"""
    conn = psycopg2.connect(
        dbname="fintechguard",
        user="postgres",
        password="070405",
        host="localhost",
        port="5432"
    )
    cursor = conn.cursor()

    # Xóa bảng cũ nếu tồn tại (để cập nhật schema mới)
    cursor.execute("DROP TABLE IF EXISTS blacklist CASCADE;")
    print("🗑️ Dropped old blacklist table.")

    # Tạo bảng mới với cột bank riêng
    cursor.execute("""
        CREATE TABLE blacklist (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_type VARCHAR(20) NOT NULL,      -- 'account' hoặc 'phone'
            entity_value VARCHAR(255) NOT NULL,    -- STK hoặc SDT
            bank VARCHAR(100),                      -- ✅ Cột riêng cho ngân hàng
            source VARCHAR(50) NOT NULL,
            risk_score DECIMAL(3,2) DEFAULT 0.95,
            evidence JSONB,                         -- Chỉ chứa: ten, so_tien_bi_lua, sdt, luot_xem
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)
    print("✅ Created blacklist table with 'bank' column.")

    # Tạo index cho query nhanh theo STK + Ngân hàng
    cursor.execute("""
        CREATE INDEX idx_blacklist_account_bank 
        ON blacklist(entity_value, bank) 
        WHERE entity_type = 'account' AND is_active = TRUE;
    """)
    print("✅ Created composite index (entity_value + bank).")

    # Tạo index cho phone
    cursor.execute("""
        CREATE INDEX idx_blacklist_phone 
        ON blacklist(entity_value) 
        WHERE entity_type = 'phone' AND is_active = TRUE;
    """)
    print("✅ Created phone index.")

    conn.commit()
    cursor.close()
    conn.close()

# ==================== BƯỚC 3: IMPORT EXCEL ====================

def import_excel():
    """Import dữ liệu từ scams-done.xlsx vào blacklist"""

    # Kết nối DB
    conn = psycopg2.connect(
        dbname="fintechguard",
        user="postgres",
        password="070405",
        host="localhost",
        port="5432"
    )
    cursor = conn.cursor()

    # Đọc file Excel
    excel_path = "scams-done.xlsx"
    if not os.path.exists(excel_path):
        print(f"❌ Không tìm thấy file: {excel_path}")
        print("   Vui lòng đặt file scams-done.xlsx cùng thư mục với script này.")
        cursor.close()
        conn.close()
        return

    df = pd.read_excel(excel_path)

    # Bỏ dòng header trùng (nếu có)
    df = df[df['STK'] != 'STK'].copy() if 'STK' in df.columns else df

    # Làm sạch STK
    df['STK_clean'] = df['STK'].astype(str).str.strip().str.replace(' ', '')
    df = df[df['STK_clean'].notna() & (df['STK_clean'] != 'nan') & (df['STK_clean'] != '')]

    # Làm sạch tên: ưu tiên "Người bị tố cáo", fallback "Tên tài khoản"
    df['ten'] = df['Người bị tố cáo'].fillna(df['Tên tài khoản']).astype(str).str.strip()
    df['ten'] = df['ten'].replace('nan', '').replace('None', '')

    # ✅ Làm sạch ngân hàng — ĐƯA RA CỘT RIÊNG
    df['ngan_hang'] = df['Ngân hàng'].astype(str).str.strip().replace('nan', 'Không rõ')

    # Làm sạch SDT
    def clean_phone(x):
        if pd.isna(x):
            return ''
        try:
            return str(int(float(x)))
        except:
            s = str(x).strip().replace('.0', '')
            return s if s != 'nan' else ''

    df['sdt'] = df['SDT'].apply(clean_phone)

    # Làm sạch số tiền
    def clean_amount(val):
        if pd.isna(val):
            return None
        try:
            return float(str(val).replace(',', ''))
        except:
            return None

    df['so_tien'] = df['Số tiền'].apply(clean_amount)

    # Làm sạch lượt xem
    def clean_views(val):
        if pd.isna(val):
            return None
        try:
            return int(str(val).replace(' lượt xem', '').replace(',', ''))
        except:
            return None

    df['luot_xem'] = df['Lượt xem'].apply(clean_views)

    # Hàm xử lý NaN/Infinity cho JSON
    def safe_json_value(v):
        if v is None:
            return None
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
        return v

    imported_acc = 0
    imported_phone = 0
    skipped = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            stk = row['STK_clean']
            ten = row['ten'] if row['ten'] else stk
            ngan_hang = row['ngan_hang']
            sdt = row['sdt']
            so_tien = safe_json_value(row['so_tien'])
            luot_xem = safe_json_value(row['luot_xem'])

            # Tính risk score dựa trên lượt xem
            risk = 0.90
            if luot_xem and luot_xem > 1000:
                risk = 0.95
            elif luot_xem and luot_xem > 100:
                risk = 0.93

            # ✅ Evidence CHỈ chứa: ten, so_tien_bi_lua, sdt, luot_xem
            # ❌ KHÔNG chứa ngan_hang nữa (đã ra cột riêng)
            evidence = {
                "ten": ten if ten else None,
                "so_tien_bi_lua": so_tien,
                "sdt": sdt if sdt else None,
                "luot_xem": luot_xem
            }
            evidence = {k: safe_json_value(v) for k, v in evidence.items() if v is not None}
            evidence_json = json.dumps(evidence, ensure_ascii=False, allow_nan=False)

            # --- Import STK (account) với bank ra cột riêng ---
            cursor.execute(
                "SELECT 1 FROM blacklist WHERE entity_value=%s AND entity_type='account' AND is_active=TRUE",
                (stk,)
            )
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO blacklist (id, entity_type, entity_value, bank, source, risk_score, evidence, is_active)
                    VALUES (%s, 'account', %s, %s, 'excel_scam_report', %s, %s::jsonb, TRUE)
                """, (
                    str(uuid.uuid4()),
                    stk,
                    ngan_hang,           # ✅ Cột bank riêng
                    risk,
                    evidence_json
                ))
                imported_acc += 1
            else:
                skipped += 1

            # --- Import SDT (phone) nếu có ---
            if sdt and len(sdt) >= 9:
                phone_ev = {
                    "ten": ten if ten else None,
                    "sdt": sdt,
                    "stk_lien_quan": stk,
                    "so_tien_bi_lua": so_tien,
                    "luot_xem": luot_xem
                }
                phone_ev = {k: safe_json_value(v) for k, v in phone_ev.items() if v is not None}
                phone_ev_json = json.dumps(phone_ev, ensure_ascii=False, allow_nan=False)

                cursor.execute(
                    "SELECT 1 FROM blacklist WHERE entity_value=%s AND entity_type='phone' AND is_active=TRUE",
                    (sdt,)
                )
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO blacklist (id, entity_type, entity_value, source, risk_score, evidence, is_active)
                        VALUES (%s, 'phone', %s, 'excel_scam_report', 0.90, %s::jsonb, TRUE)
                    """, (
                        str(uuid.uuid4()),
                        sdt,
                        phone_ev_json
                    ))
                    imported_phone += 1
                else:
                    skipped += 1

        except Exception as e:
            errors.append({"row": int(idx), "stk": str(stk), "error": str(e)})
            skipped += 1

    conn.commit()
    cursor.close()
    conn.close()

    print(f"\n✅ Import hoàn tất!")
    print(f"   STK (account): {imported_acc}")
    print(f"   SDT (phone): {imported_phone}")
    print(f"   Skipped (trùng lặp): {skipped}")
    print(f"   Errors: {len(errors)}")
    if errors:
        print(f"   Sample errors: {errors[:3]}")

# ==================== BƯỚC 4: KIỂM TRA ====================

def verify_import():
    """Kiểm tra dữ liệu đã import đúng chưa"""
    conn = psycopg2.connect(
        dbname="fintechguard",
        user="postgres",
        password="070405",
        host="localhost",
        port="5432"
    )
    cursor = conn.cursor()

    print("\n📊 KIỂM TRA DỮ LIỆU:")

    # Đếm tổng số bản ghi
    cursor.execute("SELECT COUNT(*) FROM blacklist WHERE entity_type='account'")
    acc_count = cursor.fetchone()[0]
    print(f"   Account records: {acc_count}")

    cursor.execute("SELECT COUNT(*) FROM blacklist WHERE entity_type='phone'")
    phone_count = cursor.fetchone()[0]
    print(f"   Phone records: {phone_count}")

    # Kiểm tra có cột bank không
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='blacklist'")
    columns = [r[0] for r in cursor.fetchall()]
    if 'bank' in columns:
        print(f"   ✅ Cột 'bank' đã tồn tại")
    else:
        print(f"   ❌ Cột 'bank' KHÔNG tồn tại")

    # Hiển thị 3 bản ghi mẫu
    cursor.execute("""
        SELECT entity_value, bank, risk_score, evidence 
        FROM blacklist 
        WHERE entity_type='account' 
        LIMIT 3
    """)
    print(f"\n📋 3 bản ghi mẫu:")
    for row in cursor.fetchall():
        print(f"   STK: {row[0]} | Bank: {row[1]} | Risk: {float(row[2])*100:.0f}% | Evidence: {row[3]}")

    # Test query theo STK + Bank (điều kiện kiên quyết)
    cursor.execute("""
        SELECT entity_value, bank, evidence->>'ten' as ten
        FROM blacklist 
        WHERE entity_type='account' AND bank IS NOT NULL 
        LIMIT 1
    """)
    sample = cursor.fetchone()
    if sample:
        print(f"\n🔍 Test query STK + Bank:")
        print(f"   STK: {sample[0]} | Bank: {sample[1]} | Tên: {sample[2]}")
        print(f"   ✅ Query theo STK + Ngân hàng hoạt động!")

    cursor.close()
    conn.close()

# ==================== CHẠY ====================

if __name__ == "__main__":
    print("=" * 50)
    print("FINTECHGUARD - CREATE DB & IMPORT BLACKLIST")
    print("=" * 50)

    create_database()
    create_tables()
    import_excel()
    verify_import()

    print("\n" + "=" * 50)
    print("HOÀN TẤT!")
    print("=" * 50)