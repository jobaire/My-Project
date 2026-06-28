import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

APP_NAME = os.getenv("APP_NAME", "Filaminto")
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "admin@filaminto.com")
MASTER_DB_URL = os.getenv("MASTER_DB_URL")
SHARED_DB_URL = os.getenv("SHARED_DB_URL", "")
JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "2"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "3"))
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# Email / SMTP
SMTP_HOST          = os.getenv("SMTP_HOST", "smtp.zoho.com")
SMTP_PORT          = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER          = os.getenv("SMTP_USER", "")
SMTP_PASSWORD      = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM_NAME    = os.getenv("EMAIL_FROM_NAME", APP_NAME)
EMAIL_FROM_ADDRESS = os.getenv("EMAIL_FROM_ADDRESS", SMTP_USER)
APP_URL            = os.getenv("APP_URL", "http://127.0.0.1:5173")

if not MASTER_DB_URL:
    raise ValueError("MASTER_DB_URL is not set. Check your .env file.")
