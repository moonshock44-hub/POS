"""Shared atomic sale creation — used by POST /api/sales and kiosk fulfill."""
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


def product_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return ObjectId(id_str)


def customer_oid_optional(id_str: Optional[str]) -> Optional[ObjectId]:
    if id_str is None or id_str == "":
        return None
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="customer_id inválido")
    return ObjectId(id_str)


async def rollback_stock(db, decremented: List[Tuple[ObjectId, float]]) -> None:
    """Restore stock for lines already decremented (compensating rollback)."""
    for oid, qty in reversed(decremented):
        await db.products.update_one(
            {"_id": oid},
            {
                "$inc": {"stock": qty},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )


def payment_fields(total: float, amount_paid: float, payment_method: str) -> dict:
    """Derive payment_status, amount_due, change from total and amount_paid."""
    amount_paid = float(amount_paid)
    total = float(total)
    if amount_paid < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="amount_paid debe ser >= 0",
        )
    if amount_paid >= total:
        return {
            "payment_method": payment_method,
            "amount_paid": amount_paid,
            "amount_due": 0.0,
            "payment_status": "paid",
            "change": round(amount_paid - total, 6),
        }
    return {
        "payment_method": payment_method,
        "amount_paid": amount_paid,
        "amount_due": round(total - amount_paid, 6),
        "payment_status": "partial",
        "change": 0.0,
    }



async def next_dispatch_folio(db) -> str:
    """Global auto-increment folio `D-{n}` via Mongo counters collection."""
    counter = await db.counters.find_one_and_update(
        {"_id": "dispatch_folio"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    n = int(counter.get("seq") or 1)
    return f"D-{n}"


async def ensure_dispatch_ticket(
    db,
    *,
    sale_doc: dict,
    origin: str,
    line_names: list[dict],
) -> Optional[str]:
    """
    Create one dispatch ticket for a paid sale (idempotent on sale_id).
    Returns the ticket folio (same string echoed on the sale).
    line_names: [{product_id: ObjectId, name: str, qty: float}, ...]
    """
    if sale_doc.get("payment_status") != "paid":
        return None
    if origin not in ("caja", "kiosko"):
        origin = "caja"
    existing = await db.dispatch_tickets.find_one({"sale_id": sale_doc["_id"]})
    if existing:
        return existing.get("folio")
    now = datetime.now(timezone.utc)
    lines = [
        {
            "product_id": ln["product_id"],
            "name": ln.get("name") or "",
            "qty": float(ln["qty"]),
        }
        for ln in line_names
    ]
    folio = await next_dispatch_folio(db)
    ticket = {
        "folio": folio,
        "sale_id": sale_doc["_id"],
        "origin": origin,
        "status": "pending",
        "lines": lines,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.dispatch_tickets.insert_one(ticket)
    except DuplicateKeyError:
        again = await db.dispatch_tickets.find_one({"sale_id": sale_doc["_id"]})
        return (again or {}).get("folio")
    return folio


async def create_sale_atomic(
    db,
    *,
    lines: List[dict],
    payment_method: str,
    amount_paid: float,
    customer_id: Optional[str],
    created_by: ObjectId,
    delivery_driver_id: Optional[str] = None,
    delivery_status: Optional[str] = None,
    origin: str = "caja",
) -> dict:
    """
    Create a sale and atomically decrement stock per line.

    lines: list of {"product_id": str|ObjectId, "qty": float, "price": float}
    Returns the persisted sale document (with _id).

    Same rules as POST /api/sales:
    - Unknown product → 404; inactive / insufficient stock → 400
    - Compensating stock rollback on failure
    - Partial requires active customer_id; increments balance by amount_due
    """
    now = datetime.now(timezone.utc)
    decremented: List[Tuple[ObjectId, float]] = []
    sale_lines: list[dict] = []
    dispatch_line_names: list[dict] = []
    balance_incremented = False
    customer_oid: Optional[ObjectId] = None
    amount_due_for_balance = 0.0

    try:
        for line in lines:
            pid = line["product_id"]
            oid = pid if isinstance(pid, ObjectId) else product_oid(str(pid))
            qty = float(line["qty"])
            price = float(line["price"])

            product = await db.products.find_one({"_id": oid})
            if not product:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Producto no encontrado: {pid}",
                )
            if not product.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Producto inactivo: {pid}",
                )

            updated = await db.products.find_one_and_update(
                {
                    "_id": oid,
                    "active": True,
                    "stock": {"$gte": qty},
                },
                {
                    "$inc": {"stock": -qty},
                    "$set": {"updated_at": now},
                },
                return_document=ReturnDocument.AFTER,
            )
            if updated is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Stock insuficiente para producto: {pid}",
                )

            decremented.append((oid, qty))
            line_total = qty * price
            sale_lines.append(
                {
                    "product_id": oid,
                    "qty": qty,
                    "price": price,
                    "line_total": line_total,
                }
            )
            dispatch_line_names.append(
                {
                    "product_id": oid,
                    "name": product.get("name") or "",
                    "qty": qty,
                }
            )

        total = sum(ln["line_total"] for ln in sale_lines)
        pay = payment_fields(total, amount_paid, payment_method)
        customer_oid = customer_oid_optional(customer_id)

        if pay["payment_status"] == "partial":
            if customer_oid is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="customer_id es requerido para ventas a crédito (parcial)",
                )
            customer = await db.customers.find_one({"_id": customer_oid})
            if not customer:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Cliente no encontrado",
                )
            if not customer.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cliente inactivo",
                )
        elif customer_oid is not None:
            customer = await db.customers.find_one({"_id": customer_oid})
            if not customer:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Cliente no encontrado",
                )
            if not customer.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cliente inactivo",
                )

        # Resolve optional delivery assignment (driver must exist & be active)
        delivery_driver_oid = None
        if delivery_driver_id is not None and delivery_driver_id != "":
            if not ObjectId.is_valid(delivery_driver_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="delivery_driver_id inválido",
                )
            delivery_driver_oid = ObjectId(delivery_driver_id)
            driver = await db.deliveries.find_one({"_id": delivery_driver_oid})
            if not driver:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Repartidor no encontrado",
                )
            if not driver.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Repartidor inactivo",
                )

        resolved_delivery_status = delivery_status
        if delivery_driver_oid is not None and resolved_delivery_status is None:
            resolved_delivery_status = "assigned"

        doc = {
            "lines": sale_lines,
            "total": total,
            **pay,
            "customer_id": customer_oid,
            "delivery_driver_id": delivery_driver_oid,
            "delivery_status": resolved_delivery_status,
            "created_at": now,
            "created_by": created_by,
        }

        if pay["payment_status"] == "partial" and customer_oid is not None:
            amount_due_for_balance = float(pay["amount_due"])
            await db.customers.update_one(
                {"_id": customer_oid},
                {
                    "$inc": {"balance": amount_due_for_balance},
                    "$set": {"updated_at": now},
                },
            )
            balance_incremented = True

        result = await db.sales.insert_one(doc)
        doc["_id"] = result.inserted_id
        if pay["payment_status"] == "paid":
            folio = await ensure_dispatch_ticket(
                db,
                sale_doc=doc,
                origin=origin,
                line_names=dispatch_line_names,
            )
            if folio:
                doc["folio"] = folio
                await db.sales.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"folio": folio}},
                )
        return doc

    except HTTPException:
        await rollback_stock(db, decremented)
        if balance_incremented and customer_oid is not None:
            await db.customers.update_one(
                {"_id": customer_oid},
                {
                    "$inc": {"balance": -amount_due_for_balance},
                    "$set": {"updated_at": datetime.now(timezone.utc)},
                },
            )
        raise
    except Exception:
        await rollback_stock(db, decremented)
        if balance_incremented and customer_oid is not None:
            await db.customers.update_one(
                {"_id": customer_oid},
                {
                    "$inc": {"balance": -amount_due_for_balance},
                    "$set": {"updated_at": datetime.now(timezone.utc)},
                },
            )
        raise
