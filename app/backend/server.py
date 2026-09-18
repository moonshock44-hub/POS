"""POS Tienditas — FastAPI backend (F0–F10: Inventario, Ventas, CxC, Kiosk, Deliveries, Settings, Dashboard, Despacho)."""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from routes import auth, products, sales, customers, kiosk, deliveries, despacho, settings, dashboard
from utils.security import hash_password
from utils.storage import ensure_bucket

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def load_settings() -> dict:
    return {
        "MONGO_URL": os.getenv("MONGO_URL", "mongodb://localhost:27017"),
        "DB_NAME": os.getenv("DB_NAME", "pos_tienditas"),
        "JWT_SECRET": os.getenv("JWT_SECRET", "dev-secret-change-me"),
        "JWT_ALGORITHM": os.getenv("JWT_ALGORITHM", "HS256"),
        # POS default 12h (was 24h); override via env. Shorter = less stolen-cookie window.
        "JWT_EXPIRE_MINUTES": int(os.getenv("JWT_EXPIRE_MINUTES", "720")),
        "CORS_ORIGINS": [
            o.strip()
            for o in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if o.strip()
        ],
        "COOKIE_SECURE": os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes"),
        # In-memory rate limits (per IP / minute). 0 disables a bucket.
        "RATE_LIMIT_LOGIN_PER_MIN": int(os.getenv("RATE_LIMIT_LOGIN_PER_MIN", "5")),
        "RATE_LIMIT_REGISTER_PER_MIN": int(os.getenv("RATE_LIMIT_REGISTER_PER_MIN", "3")),
        "RATE_LIMIT_SETTINGS_WRITE_PER_MIN": int(os.getenv("RATE_LIMIT_SETTINGS_WRITE_PER_MIN", "10")),
        "RATE_LIMIT_UPLOAD_PER_MIN": int(os.getenv("RATE_LIMIT_UPLOAD_PER_MIN", "10")),
        "SEED_ADMIN_EMAIL": os.getenv("SEED_ADMIN_EMAIL", "admin@tienditas.com"),
        "SEED_ADMIN_PASSWORD": os.getenv("SEED_ADMIN_PASSWORD", "Admin123!"),
        "SEED_ADMIN_NAME": os.getenv("SEED_ADMIN_NAME", "Administrador"),
        # Object storage (MinIO / S3-compatible) — never store Base64 images in Mongo
        "S3_ENDPOINT_URL": os.getenv("S3_ENDPOINT_URL", "http://127.0.0.1:9000"),
        "S3_PUBLIC_URL": os.getenv("S3_PUBLIC_URL", "http://127.0.0.1:9000"),
        "S3_ACCESS_KEY": os.getenv("S3_ACCESS_KEY", "minioadmin"),
        "S3_SECRET_KEY": os.getenv("S3_SECRET_KEY", "minioadmin"),
        "S3_BUCKET": os.getenv("S3_BUCKET", "pos-tienditas"),
        "S3_REGION": os.getenv("S3_REGION", "us-east-1"),
        "S3_PUBLIC_READ": os.getenv("S3_PUBLIC_READ", "true").lower() in ("1", "true", "yes"),
    }



_WEAK_JWT_DEFAULTS = {
    "dev-secret-change-me",
    "change-me-to-a-long-random-secret-in-production",
}


def _warn_insecure_settings(settings: dict) -> None:
    secret = settings.get("JWT_SECRET") or ""
    if secret in _WEAK_JWT_DEFAULTS or len(secret) < 32:
        print(
            "[startup] WARNING: JWT_SECRET is weak/default — set a long random secret before production"
        )
    if not settings.get("COOKIE_SECURE"):
        print(
            "[startup] NOTE: COOKIE_SECURE=false (OK for local HTTP; enable for HTTPS)"
        )

async def seed_admin(db, settings: dict) -> None:
    email = settings["SEED_ADMIN_EMAIL"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        return
    now = datetime.now(timezone.utc)
    await db.users.insert_one(
        {
            "email": email,
            "name": settings["SEED_ADMIN_NAME"],
            "hashed_password": hash_password(settings["SEED_ADMIN_PASSWORD"]),
            "role": "admin",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
    )
    print(f"[seed] Admin creado: {email}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    client = AsyncIOMotorClient(settings["MONGO_URL"])
    db = client[settings["DB_NAME"]]
    app.state.settings = settings
    app.state.client = client
    app.state.db = db
    # ping
    await client.admin.command("ping")
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("active")
    await db.sales.create_index("created_at")
    await db.sales.create_index("created_by")
    await db.sales.create_index([("customer_id", 1), ("payment_status", 1)])
    await db.customers.create_index("phone")
    await db.customers.create_index("active")
    await db.customer_payments.create_index([("customer_id", 1), ("created_at", -1)])
    await db.kiosk_orders.create_index("status")
    await db.kiosk_orders.create_index("created_at")
    await db.kiosk_orders.create_index([("status", 1), ("created_at", 1)])
    await db.deliveries.create_index("active")
    await db.deliveries.create_index("name")
    await db.sales.create_index("delivery_driver_id")
    await db.sales.create_index("delivery_status")
    await db.dispatch_tickets.create_index("sale_id", unique=True)
    await db.dispatch_tickets.create_index("status")
    _warn_insecure_settings(settings)
    await seed_admin(db, settings)
    try:
        ensure_bucket(settings)
        print("[startup] Object storage bucket OK")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] Object storage warn (upload may fail until MinIO is up): {exc}")
    print("[startup] MongoDB OK, seed listo")
    yield
    client.close()


app = FastAPI(title="POS Tienditas API", version="0.9.0", lifespan=lifespan)

_settings = load_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings["CORS_ORIGINS"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(customers.router, prefix="/api")
app.include_router(kiosk.router, prefix="/api")
app.include_router(deliveries.router, prefix="/api")
app.include_router(despacho.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/api/health")
async def health():
    """Health check — verifies Mongo connectivity."""
    try:
        await app.state.client.admin.command("ping")
        mongo_ok = True
    except Exception as exc:  # noqa: BLE001
        return {"status": "degraded", "mongo": False, "error": str(exc)}
    return {"status": "ok", "mongo": mongo_ok, "service": "pos-tienditas"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
