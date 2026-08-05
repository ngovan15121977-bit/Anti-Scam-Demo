import pandas as pd
from sqlalchemy.orm import Session
from typing import List, Dict, Tuple
from ..models import Blacklist
import uuid

class ExcelImporter:
    """
    Import dữ liệu scam từ file Excel vào blacklist.
    File Excel có các cột: Người bị tố cáo, Tên tài khoản, Số tiền, SDT, STK, Ngân hàng, Lượt xem
    """
    
    REQUIRED_COLUMNS = ["Người bị tố cáo", "Tên tài khoản", "Số tiền", "SDT", "STK", "Ngân hàng", "Lượt xem"]
    
    @classmethod
    def validate_file(cls, file_path: str) -> bool:
        """Kiểm tra file Excel có đúng cấu trúc không"""
        try:
            df = pd.read_excel(file_path)
            # Bỏ qua dòng header trùng nếu có
            df = df[df['STK'] != 'STK'].copy() if 'STK' in df.columns else df
            missing = [col for col in cls.REQUIRED_COLUMNS if col not in df.columns]
            if missing:
                raise ValueError(f"Thiếu cột: {missing}. Các cột phải có: {cls.REQUIRED_COLUMNS}")
            return True
        except Exception as e:
            raise ValueError(f"Lỗi đọc file Excel: {str(e)}")
    
    @classmethod
    def _clean_dataframe(cls, df: pd.DataFrame) -> pd.DataFrame:
        """Làm sạch DataFrame trước khi import"""
        # Bỏ dòng header trùng (nếu dòng đầu cũng là header text)
        df = df[df['STK'] != 'STK'].copy()
        
        # Làm sạch STK: bỏ khoảng trắng, giữ nguyên nội dung
        df['STK_clean'] = df['STK'].astype(str).str.strip().str.replace(' ', '')
        
        # Loại bỏ dòng không có STK hợp lệ
        df = df[df['STK_clean'].notna() & (df['STK_clean'] != 'nan') & (df['STK_clean'] != '')]
        
        # Làm sạch tên: ưu tiên Người bị tố cáo, fallback Tên tài khoản
        df['ten'] = df['Người bị tố cáo'].fillna(df['Tên tài khoản']).astype(str).str.strip()
        df['ten'] = df['ten'].replace('nan', '').replace('None', '')
        
        # Làm sạch ngân hàng
        df['ngan_hang'] = df['Ngân hàng'].astype(str).str.strip().replace('nan', 'Không rõ')
        
        # Làm sạch SDT
        def clean_phone(x):
            if pd.isna(x):
                return ''
            try:
                # Bỏ .0 nếu là float
                s = str(int(float(x)))
                return s
            except:
                s = str(x).strip().replace('.0', '')
                return s if s != 'nan' else ''
        
        df['sdt'] = df['SDT'].apply(clean_phone)
        
        # Làm sạch số tiền (bỏ dấu phẩy phân cách hàng nghìn)
        def clean_amount(val):
            if pd.isna(val):
                return None
            s = str(val).replace(',', '').strip()
            try:
                return float(s)
            except:
                return None
        
        df['so_tien'] = df['Số tiền'].apply(clean_amount)
        
        # Làm sạch lượt xem
        def clean_views(val):
            if pd.isna(val):
                return None
            s = str(val).replace(' lượt xem', '').replace(',', '').strip()
            try:
                return int(float(s))
            except:
                return None
        
        df['luot_xem'] = df['Lượt xem'].apply(clean_views)
        
        return df
    
    @classmethod
    def import_to_blacklist(
        cls, 
        db: Session, 
        file_path: str,
        source: str = "excel_scam_report",
        base_risk_score: float = 0.90
    ) -> Dict:
        """
        Import dữ liệu từ Excel vào bảng blacklist.
        Mỗi STK = 1 entity account. Mỗi SDT (nếu có) = 1 entity phone.
        """
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))
        
        imported_accounts = 0
        imported_phones = 0
        skipped = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                stk = row['STK_clean']
                ten = row['ten'] if row['ten'] else row['STK_clean']
                ngan_hang = row['ngan_hang']
                sdt = row['sdt']
                so_tien = row['so_tien']
                luot_xem = row['luot_xem']
                
                # --- Import STK (account) ---
                # Kiểm tra trùng lặp STK
                existing_acc = db.query(Blacklist).filter(
                    Blacklist.entity_value == stk,
                    Blacklist.entity_type == "account",
                    Blacklist.is_active == True
                ).first()
                
                if not existing_acc:
                    # Tính risk score dựa trên lượt xem (càng nhiều lượt xem = càng nhiều người tố cáo = rủi ro cao hơn)
                    risk_score = base_risk_score
                    if luot_xem and luot_xem > 1000:
                        risk_score = min(0.99, base_risk_score + 0.05)
                    elif luot_xem and luot_xem > 100:
                        risk_score = min(0.98, base_risk_score + 0.03)
                    
                    evidence = {
                        "ten": ten,
                        "ngan_hang": ngan_hang,
                        "so_tien_bi_lua": so_tien,
                        "sdt": sdt if sdt else None,
                        "luot_xem": luot_xem,
                        "imported_from": file_path,
                        "row_index": int(idx)
                    }
                    
                    # Lọc bỏ None values để JSON gọn hơn
                    evidence = {k: v for k, v in evidence.items() if v is not None}
                    
                    blacklist_entry = Blacklist(
                        id=uuid.uuid4(),
                        entity_type="account",
                        entity_value=stk,
                        source=source,
                        risk_score=risk_score,
                        evidence=evidence,
                        is_active=True
                    )
                    db.add(blacklist_entry)
                    imported_accounts += 1
                
                # --- Import SDT (phone) nếu có ---
                if sdt and len(sdt) >= 9:
                    existing_phone = db.query(Blacklist).filter(
                        Blacklist.entity_value == sdt,
                        Blacklist.entity_type == "phone",
                        Blacklist.is_active == True
                    ).first()
                    
                    if not existing_phone:
                        phone_evidence = {
                            "ten": ten,
                            "sdt": sdt,
                            "stk_lien_quan": stk,
                            "ngan_hang": ngan_hang,
                            "so_tien_bi_lua": so_tien,
                            "luot_xem": luot_xem,
                            "imported_from": file_path,
                            "row_index": int(idx)
                        }
                        phone_evidence = {k: v for k, v in phone_evidence.items() if v is not None}
                        
                        phone_entry = Blacklist(
                            id=uuid.uuid4(),
                            entity_type="phone",
                            entity_value=sdt,
                            source=source,
                            risk_score=base_risk_score,
                            evidence=phone_evidence,
                            is_active=True
                        )
                        db.add(phone_entry)
                        imported_phones += 1
                
            except Exception as e:
                errors.append({"row": int(idx), "stk": str(stk), "error": str(e)})
                skipped += 1
        
        db.commit()
        
        return {
            "total_rows_processed": len(df),
            "imported_accounts": imported_accounts,
            "imported_phones": imported_phones,
            "skipped": skipped,
            "errors": errors[:20]  # Giới hạn 20 lỗi đầu
        }
    
    @classmethod
    def preview_data(cls, file_path: str, limit: int = 10) -> List[Dict]:
        """Xem trước dữ liệu trong file Excel sau khi làm sạch"""
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))
        preview_df = df.head(limit)[['ten', 'STK_clean', 'ngan_hang', 'sdt', 'so_tien', 'luot_xem']]
        preview_df.columns = ['ten', 'stk', 'ngan_hang', 'sdt', 'so_tien', 'luot_xem']
        return preview_df.to_dict("records")
    
    @classmethod
    def get_statistics(cls, file_path: str) -> Dict:
        """Thống kê dữ liệu trong file Excel"""
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))
        
        return {
            "total_records": len(df),
            "has_phone": (df['sdt'] != '').sum(),
            "missing_phone": (df['sdt'] == '').sum(),
            "unique_banks": df['ngan_hang'].nunique(),
            "top_banks": df['ngan_hang'].value_counts().head(5).to_dict(),
            "amount_stats": {
                "min": df['so_tien'].min(),
                "max": df['so_tien'].max(),
                "mean": round(df['so_tien'].mean(), 2) if df['so_tien'].notna().any() else None
            },
            "view_stats": {
                "min": df['luot_xem'].min(),
                "max": df['luot_xem'].max(),
                "mean": round(df['luot_xem'].mean(), 2) if df['luot_xem'].notna().any() else None
            }
        }