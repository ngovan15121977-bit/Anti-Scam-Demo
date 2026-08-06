from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .routers import health, auth, transactions, blacklist

# KHÔNG dùng create_all nữa — schema đã tạo bằng SQL file rồi
# Base.metadata.create_all(bind=engine)

app = FastAPI(title="FintechGuard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(blacklist.router)

@app.get("/")
async def root():
    return {"message": "FintechGuard API is running"}