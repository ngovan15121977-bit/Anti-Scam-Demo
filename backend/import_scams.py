import pandas as pd
import psycopg2
import uuid
import json
import math

conn = psycopg2.connect(
    dbname="fin19_db", user="postgres", password="070405",
    host="localhost", port="5432"
)
cursor = conn.cursor()

df = pd.read_excel("scams-done.xlsx")
df = df[df['STK'] != 'STK'].copy()

df['STK_clean'] = df['STK'].astype(str).str.strip().str.replace(' ', '')
df = df[df['STK_clean'].notna() & (df['STK_clean'] != 'nan') & (df['STK_clean'] != '')]

df['ten'] = df['Người bị tố cáo'].fillna(df['Tên tài khoản']).astype(str).str.strip().replace('nan', '')
df['ngan_hang'] = df['Ngân hàng'].astype(str).str.strip().replace('nan', 'Không rõ')

def clean_phone(x):
    if pd.isna(x): return ''
    try: return str(int(float(x)))
    except: return str(x).strip().replace('.0', '')

df['sdt'] = df['SDT'].apply(clean_phone)

def clean_amount(val):
    if pd.isna(val): return None
    try: return float(str(val).replace(',', ''))
    except: return None

df['so_tien'] = df['Số tiền'].apply(clean_amount)

def clean_views(val):
    if pd.isna(val): return None
    try: return int(str(val).replace(' lượt xem', '').replace(',', ''))
    except: return None

df['luot_xem'] = df['Lượt xem'].apply(clean_views)

def safe_json_value(v):
    """Xử lý NaN, Infinity thành None"""
    if v is None: return None
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v): return None
    return v

imported_acc = 0
imported_phone = 0

for _, row in df.iterrows():
    stk = row['STK_clean']
    ten = row['ten'] if row['ten'] else stk
    ngan_hang = row['ngan_hang']
    sdt = row['sdt']
    so_tien = safe_json_value(row['so_tien'])
    luot_xem = safe_json_value(row['luot_xem'])
    
    risk = 0.90
    if luot_xem and luot_xem > 1000: risk = 0.95
    elif luot_xem and luot_xem > 100: risk = 0.93
    
    evidence = {
        "ten": ten if ten else None,
        "ngan_hang": ngan_hang if ngan_hang != 'Không rõ' else None,
        "so_tien_bi_lua": so_tien,
        "sdt": sdt if sdt else None,
        "luot_xem": luot_xem
    }
    # Lọc bỏ None, rồi xử lý NaN cuối cùng
    evidence = {k: safe_json_value(v) for k, v in evidence.items() if v is not None}
    evidence_json = json.dumps(evidence, ensure_ascii=False, allow_nan=False)
    
    cursor.execute("SELECT 1 FROM blacklist WHERE entity_value=%s AND entity_type='account' AND is_active=TRUE", (stk,))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO blacklist (id, entity_type, entity_value, source, risk_score, evidence, is_active)
            VALUES (%s, 'account', %s, 'excel_scam_report', %s, %s::jsonb, TRUE)
        """, (str(uuid.uuid4()), stk, risk, evidence_json))
        imported_acc += 1
    
    if sdt and len(sdt) >= 9:
        phone_ev = {
            "ten": ten if ten else None,
            "sdt": sdt,
            "stk_lien_quan": stk,
            "ngan_hang": ngan_hang if ngan_hang != 'Không rõ' else None,
            "so_tien_bi_lua": so_tien,
            "luot_xem": luot_xem
        }
        phone_ev = {k: safe_json_value(v) for k, v in phone_ev.items() if v is not None}
        phone_ev_json = json.dumps(phone_ev, ensure_ascii=False, allow_nan=False)
        cursor.execute("""
                INSERT INTO blacklist (id, entity_type, entity_value, source, risk_score, evidence, is_active)
                VALUES (%s, 'phone', %s, 'excel_scam_report', 0.90, %s::jsonb, TRUE)
            """, (str(uuid.uuid4()), sdt, phone_ev_json))
        imported_phone += 1

conn.commit()
cursor.close()
conn.close()

print(f"✅ Import hoàn tất!")
print(f"   STK (account): {imported_acc}")
print(f"   SDT (phone): {imported_phone}")
print(f"   Tổng: {imported_acc + imported_phone}")