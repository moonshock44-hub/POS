"""Kiosk orders — public POST create; auth for list/count/fulfill/cancel."""
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pymongo import ReturnDocument

from models.kiosk_order import (
    KioskFulfillBody,
    KioskFulfillResponse,
    KioskOrderCreate,
    KioskOrderPublic,
    KioskPendingCount,
)
from models.sale import SalePublic
from routes.auth import get_current_user, get_db
from utils.sale_service import create_sale_atomic

router = APIRouter(prefix="/kiosk", tags=["kiosk"])


class KioskProductPublic(BaseModel):
    """Catálogo público kiosko — sin cost ni datos sensibles de inventario interno."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    sku: str
    category: str
    unit: str
    stock: float
    price: float
    image_url: Optional[str] = None
    active: bool = True

    @classmethod
    def from_doc(cls, doc: dict) -> "KioskProductPublic":
        return cls(
            id=str(doc["_id"]),
            name=doc.get("name") or "",
            sku=doc.get("sku") or "",
            category=doc.get("category") or "",
            unit=doc.get("unit") or "pza",
            stock=float(doc.get("stock") or 0),
            price=float(doc.get("price") or 0),
            image_url=doc.get("image_url"),
            active=bool(doc.get("active", True)),
        )


@router.get("/products", response_model=List[KioskProductPublic])
async def list_kiosk_products(request: Request):
    """
    Public catalog for self-service kiosk — NO JWT.
    Active products only; omits cost (use GET /api/products with auth for full data).
    """
    db = get_db(request)
    cursor = db.products.find({"active": True}).sort("name", 1)
    docs = await cursor.to_list(length=10_000)
    return [KioskProductPublic.from_doc(d) for d in docs]



def _order_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID de orden inválido",
        )
    return ObjectId(id_str)


def _product_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto no encontrado: {id_str}",
        )
    return ObjectId(id_str)


@router.post(
    "/orders",
    response_model=KioskOrderPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_kiosk_order(body: KioskOrderCreate, request: Request):
    """
    Public kiosk order create — NO JWT.

    Validates products exist and are active. Prices from server product.price
    (client prices ignored). Does NOT decrement stock (cashier fulfills later).
    status = pending.
    """
    db = get_db(request)
    now = datetime.now(timezone.utc)
    order_lines: list[dict] = []

    for line in body.lines:
        oid = _product_oid(line.product_id)
        qty = float(line.qty)

        product = await db.products.find_one({"_id": oid})
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto no encontrado: {line.product_id}",
            )
        if not product.get("active", True):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Producto inactivo: {line.product_id}",
            )

        price = float(product.get("price", 0))
        line_total = qty * price
        order_lines.append(
            {
                "product_id": oid,
                "product_name": product.get("name", ""),
                "qty": qty,
                "price": price,
                "line_total": line_total,
            }
        )

    total = sum(ln["line_total"] for ln in order_lines)
    customer_name = body.customer_name
    if customer_name is not None:
        customer_name = customer_name.strip() or None
    note = body.note
    if note is not None:
        note = note.strip() or None

    doc = {
        "lines": order_lines,
        "total": total,
        "customer_name": customer_name,
        "note": note,
        "status": "pending",
        "sale_id": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.kiosk_orders.insert_one(doc)
    doc["_id"] = result.inserted_id
    return KioskOrderPublic.from_doc(doc)


@router.get("/orders/pending/count", response_model=KioskPendingCount)
async def pending_count(
    request: Request,
    _user=Depends(get_current_user),
):
    """Auth required — count of kiosk orders with status=pending."""
    db = get_db(request)
    n = await db.kiosk_orders.count_documents({"status": "pending"})
    return KioskPendingCount(count=n)


@router.get("/orders", response_model=List[KioskOrderPublic])
async def list_kiosk_orders(
    request: Request,
    _user=Depends(get_current_user),
    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
        description="Filter by status, e.g. pending",
    ),
):
    """Auth required — list kiosk orders for cashier. Optional ?status=pending."""
    db = get_db(request)
    query: dict = {}
    if status_filter is not None and status_filter != "":
        allowed = ("pending", "fulfilled", "cancelled")
        if status_filter not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"status inválido (esperado: {', '.join(allowed)})",
            )
        query["status"] = status_filter
    cursor = db.kiosk_orders.find(query).sort("created_at", 1)
    docs = await cursor.to_list(length=10_000)
    return [KioskOrderPublic.from_doc(d) for d in docs]


@router.post("/orders/{order_id}/fulfill", response_model=KioskFulfillResponse)
async def fulfill_kiosk_order(
    order_id: str,
    body: KioskFulfillBody,
    request: Request,
    user=Depends(get_current_user),
):
    """
    Auth required — fulfill pending kiosk order.

    Creates a real sale with SAME atomic stock + payment rules as POST /api/sales
    (via create_sale_atomic). Marks order status=fulfilled and stores sale_id.
    Stock was NOT deducted on create — only here.
    """
    db = get_db(request)
    oid = _order_oid(order_id)
    now = datetime.now(timezone.utc)

    order = await db.kiosk_orders.find_one({"_id": oid})
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden kiosk no encontrada",
        )
    if order.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Orden no está pending (status={order.get('status')})",
        )

    sale_lines = [
        {
            "product_id": ln["product_id"],
            "qty": ln["qty"],
            "price": ln["price"],
        }
        for ln in order.get("lines", [])
    ]
    if not sale_lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Orden sin líneas",
        )

    sale_doc = await create_sale_atomic(
        db,
        lines=sale_lines,
        payment_method=body.payment_method,
        amount_paid=body.amount_paid,
        customer_id=body.customer_id,
        created_by=user["_id"],
        origin="kiosko",
    )

    # Mark fulfilled only if still pending (race-safe)
    updated = await db.kiosk_orders.find_one_and_update(
        {"_id": oid, "status": "pending"},
        {
            "$set": {
                "status": "fulfilled",
                "sale_id": sale_doc["_id"],
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        # Sale already created; order raced — leave sale, report conflict
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Orden ya no está pending (posible fulfillment concurrente)",
        )

    return KioskFulfillResponse(
        order=KioskOrderPublic.from_doc(updated),
        sale=SalePublic.from_doc(sale_doc),
    )


@router.post("/orders/{order_id}/cancel", response_model=KioskOrderPublic)
async def cancel_kiosk_order(
    order_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    """Auth required — cancel a pending kiosk order (no stock change; none was held)."""
    db = get_db(request)
    oid = _order_oid(order_id)
    now = datetime.now(timezone.utc)

    updated = await db.kiosk_orders.find_one_and_update(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "cancelled", "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        existing = await db.kiosk_orders.find_one({"_id": oid})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Orden kiosk no encontrada",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Orden no está pending (status={existing.get('status')})",
        )
    return KioskOrderPublic.from_doc(updated)
