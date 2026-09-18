#!/usr/bin/env python3
"""F9 optional: close legacy partial sales with missing customer_id (create path already 400s)."""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "app/backend/.env")


async def main() -> None:
    url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    dbn = os.getenv("DB_NAME", "pos_tienditas")
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    db = client[dbn]
    q = {
        "payment_status": "partial",
        "$or": [{"customer_id": None}, {"customer_id": {"$exists": False}}],
    }
    docs = await db.sales.find(q).to_list(1000)
    print(f"orphans={len(docs)}")
    if not docs:
        return
    now = datetime.now(timezone.utc)
    ids = [d["_id"] for d in docs]
    res = await db.sales.update_many(
        {"_id": {"$in": ids}},
        {
            "$set": {
                "payment_status": "paid",
                "amount_due": 0.0,
                "orphan_closed_at": now,
                "orphan_close_reason": "F9 cleanup: partial without customer_id",
            }
        },
    )
    print(f"updated={res.modified_count}")


if __name__ == "__main__":
    asyncio.run(main())
