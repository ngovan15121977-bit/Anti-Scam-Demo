import sys
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from src.app.services.email_service import send_email
import os

print("EMAIL_ENABLED =", os.getenv("EMAIL_ENABLED"))
print("HAS_KEY =", bool(os.getenv("RESEND_API_KEY")))

TO = "samsamsam0905@gmail.com"  # đúng mail Resend

ok = send_email(
    to=TO,
    subject="[Timi] Test lại " + __import__("datetime").datetime.now().strftime("%H:%M:%S"),
    html="<p>Test mail mới</p>",
)
print("result:", ok)