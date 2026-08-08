"""Import Excel scam intelligence without embedding database credentials."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2 import sql

from app.config import get_settings
from app.services.bank_normalization import normalize_bank_name


def _clean_phone(value: object) -> str:
    if pd.isna(value):
        return ""
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return str(value).strip().replace(".0", "")


def _clean_amount(value: object) -> float | None:
    if pd.isna(value):
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _clean_views(value: object) -> int | None:
    if pd.isna(value):
        return None
    try:
        return int(str(value).replace(" lượt xem", "").replace(",", ""))
    except (TypeError, ValueError):
        return None


def _json_safe(value: object) -> object:
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _database_url() -> str:
    return get_settings().database_url.replace("postgresql+psycopg2://", "postgresql://")


def import_file(path: Path) -> tuple[int, int, int]:
    if not path.is_file():
        raise FileNotFoundError(f"Không tìm thấy file Excel: {path}")

    df = pd.read_excel(path)
    required = {"STK", "Người bị tố cáo", "Tên tài khoản", "Ngân hàng", "SDT", "Số tiền", "Lượt xem"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Excel thiếu cột bắt buộc: {', '.join(missing)}")

    df = df[df["STK"] != "STK"].copy()
    df["account"] = df["STK"].astype(str).str.strip().str.replace(" ", "")
    df = df[df["account"].notna() & ~df["account"].isin(["", "nan"])]
    df["name"] = df["Người bị tố cáo"].fillna(df["Tên tài khoản"]).astype(str).str.strip()
    df["bank"] = df["Ngân hàng"].astype(str).str.strip().replace("nan", "Không rõ")
    df["phone"] = df["SDT"].map(_clean_phone)
    df["amount"] = df["Số tiền"].map(_clean_amount)
    df["views"] = df["Lượt xem"].map(_clean_views)

    accounts = phones = skipped = 0
    settings = get_settings()
    with psycopg2.connect(_database_url()) as conn, conn.cursor() as cursor:
        # This script opens psycopg2 directly, so it must set the same schema
        # search path that SQLAlchemy uses for the API connection.
        cursor.execute(
            sql.SQL("SET search_path TO {}, public").format(
                sql.Identifier(settings.database_schema)
            )
        )
        cursor.execute("SELECT to_regclass(%s)", (f"{settings.database_schema}.blacklist",))
        if cursor.fetchone()[0] is None:
            raise RuntimeError(
                f"Không tìm thấy bảng {settings.database_schema}.blacklist. "
                "Hãy chạy backend/sql/create_antiscam_schema.sql trước."
            )
        for _, row in df.iterrows():
            account = row["account"]
            bank = normalize_bank_name(row["bank"])
            views = _json_safe(row["views"])
            risk = 0.95 if views and views > 1000 else 0.93 if views and views > 100 else 0.90
            evidence = {
                "reported_name": row["name"] if row["name"] not in {"", "nan"} else None,
                "reported_amount": _json_safe(row["amount"]),
                "report_count": views,
            }
            evidence = {key: value for key, value in evidence.items() if value is not None}

            cursor.execute(
                """
                SELECT 1 FROM blacklist
                WHERE entity_type = 'account' AND entity_value = %s
                  AND bank IS NOT DISTINCT FROM %s AND is_active = TRUE
                """,
                (account, bank),
            )
            if cursor.fetchone() is None:
                cursor.execute(
                    """
                    INSERT INTO blacklist (entity_type, entity_value, bank, source, risk_score, evidence, is_active)
                    VALUES ('account', %s, %s, 'excel_scam_report', %s, %s::jsonb, TRUE)
                    """,
                    (account, bank, risk, json.dumps(evidence, ensure_ascii=False, allow_nan=False)),
                )
                accounts += 1
            else:
                skipped += 1

            phone = row["phone"]
            if phone and len(phone) >= 9:
                cursor.execute(
                    """
                    SELECT 1 FROM blacklist
                    WHERE entity_type = 'phone' AND entity_value = %s AND is_active = TRUE
                    """,
                    (phone,),
                )
                if cursor.fetchone() is None:
                    phone_evidence = {**evidence, "related_account": account}
                    cursor.execute(
                        """
                        INSERT INTO blacklist (entity_type, entity_value, source, risk_score, evidence, is_active)
                        VALUES ('phone', %s, 'excel_scam_report', 0.9000, %s::jsonb, TRUE)
                        """,
                        (phone, json.dumps(phone_evidence, ensure_ascii=False, allow_nan=False)),
                    )
                    phones += 1
                else:
                    skipped += 1
    return accounts, phones, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Excel blacklist into PostgreSQL")
    parser.add_argument("--file", default="scams-done.xlsx", help="Đường dẫn file .xlsx")
    args = parser.parse_args()
    accounts, phones, skipped = import_file(Path(args.file))
    print(f"Imported accounts: {accounts}")
    print(f"Imported phones: {phones}")
    print(f"Skipped existing records: {skipped}")


if __name__ == "__main__":
    main()
