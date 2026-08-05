import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Sửa từ fintechguard → fin19_db
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:070405@localhost:5432/fin19_db"  # <-- sửa ở đây
)

engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()