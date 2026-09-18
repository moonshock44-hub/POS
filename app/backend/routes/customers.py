"""Customers CRUD + CxC payments / account — auth required."""
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pymongo import ReturnDocument

from models.customer import (
    AccountStatement,
    CustomerCreate,
    CustomerPublic,
    CustomerUpdate,
    PaymentCreate,
    PaymentPublic,
)
from models.sale import SalePublic
from routes.auth import get_current_user, get_db

router = APIRouter(prefix="/customers", tags=["customers"])

# Float money compare: reject overpay if amount exceeds balance by more than this
_EPS = 1e-9


def _customer_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return ObjectId(id_str)


@router.get("", response_model=List[CustomerPublic])
async def list_customers(
    request: Request,
    _user=Depends(get_current_user),
    active: Optional[bool] = Query(
        default=True,
        description="Default true = only active. Pass false to include inactive.",
    ),
):
    """List customers. By default only active; ?active=false includes inactive."""
    db = get_db(request)
    query: dict = {}
    if active is True:
        query["active"] = True
    cursor = db.customers.find(query).sort("name", 1)
    docs = await cursor.to_list(length=10_000)
    return [CustomerPublic.from_doc(d) for d in docs]


@router.post("", response_model=CustomerPublic, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    now = datetime.now(timezone.utc)
    email = body.email.strip() if body.email else None
    if email == "":
        email = None
    notes = body.notes.strip() if body.notes else None
    if notes == "":
        notes = None
    doc = {
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "email": email,
        "notes": notes,
        "balance": 0.0,
        "active": body.active,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.customers.insert_one(doc)
    doc["_id"] = result.inserted_id
    return CustomerPublic.from_doc(doc)


@router.get("/{customer_id}/account", response_model=AccountStatement)
async def get_account(
    customer_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    """Customer + open (partial) sales + recent payments."""
    db = get_db(request)
    oid = _customer_oid(customer_id)
    customer = await db.customers.find_one({"_id": oid})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    open_cursor = db.sales.find(
        {"customer_id": oid, "payment_status": "partial"}
    ).sort("created_at", 1)
    open_docs = await open_cursor.to_list(length=10_000)

    pay_cursor = (
        db.customer_payments.find({"customer_id": oid})
        .sort("created_at", -1)
        .limit(50)
    )
    pay_docs = await pay_cursor.to_list(length=50)

    return AccountStatement(
        customer=CustomerPublic.from_doc(customer),
        open_sales=[SalePublic.from_doc(d) for d in open_docs],
        payments=[PaymentPublic.from_doc(d) for d in pay_docs],
    )


@router.post(
    "/{customer_id}/payments",
    response_model=PaymentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    customer_id: str,
    body: PaymentCreate,
    request: Request,
    user=Depends(get_current_user),
):
    """
    Abono CxC: reduce balance (not below 0; reject if amount > balance),
    apply FIFO to partial sales, persist payment doc.
    Compensating rollback if mid-flight failure (standalone Mongo).
    """
    db = get_db(request)
    oid = _customer_oid(customer_id)
    amount = float(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount debe ser > 0")

    now = datetime.now(timezone.utc)
    note = body.note.strip() if body.note else None
    if note == "":
        note = None

    # Atomically deduct balance only if sufficient funds owed
    customer = await db.customers.find_one_and_update(
        {
            "_id": oid,
            "active": True,
            "balance": {"$gte": amount - _EPS},
        },
        {
            "$inc": {"balance": -amount},
            "$set": {"updated_at": now},
        },
        return_document=ReturnDocument.AFTER,
    )
    if customer is None:
        existing = await db.customers.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        if not existing.get("active", True):
            raise HTTPException(status_code=400, detail="Cliente inactivo")
        bal = float(existing.get("balance", 0))
        if amount > bal + _EPS:
            raise HTTPException(
                status_code=400,
                detail=f"Monto excede saldo ({bal})",
            )
        raise HTTPException(status_code=400, detail="No se pudo aplicar el abono")

    # Clamp tiny float drift below zero
    bal_after = float(customer.get("balance", 0))
    if bal_after < 0 and abs(bal_after) < 1e-6:
        await db.customers.update_one(
            {"_id": oid},
            {"$set": {"balance": 0.0, "updated_at": now}},
        )
        bal_after = 0.0
        customer["balance"] = 0.0

    applied_to: list[dict] = []
    sale_updates: list[tuple[ObjectId, dict]] = []  # for rollback: (sale_id, previous fields)

    try:
        remaining = amount
        cursor = db.sales.find(
            {"customer_id": oid, "payment_status": "partial"}
        ).sort("created_at", 1)
        open_sales = await cursor.to_list(length=10_000)

        for sale in open_sales:
            if remaining <= _EPS:
                break
            due = float(sale.get("amount_due", 0))
            if due <= _EPS:
                continue
            apply_amt = min(remaining, due)
            new_paid = float(sale.get("amount_paid", 0)) + apply_amt
            new_due = round(due - apply_amt, 6)
            if new_due < 0:
                new_due = 0.0
            new_status = "paid" if new_due <= _EPS else "partial"
            if new_status == "paid":
                new_due = 0.0

            prev = {
                "amount_paid": sale.get("amount_paid"),
                "amount_due": sale.get("amount_due"),
                "payment_status": sale.get("payment_status"),
            }
            sale_updates.append((sale["_id"], prev))

            await db.sales.update_one(
                {"_id": sale["_id"]},
                {
                    "$set": {
                        "amount_paid": round(new_paid, 6),
                        "amount_due": new_due,
                        "payment_status": new_status,
                    }
                },
            )
            applied_to.append({"sale_id": sale["_id"], "amount": apply_amt})
            remaining = round(remaining - apply_amt, 6)

        pay_doc = {
            "customer_id": oid,
            "amount": amount,
            "payment_method": body.payment_method,
            "note": note,
            "applied_to": applied_to,
            "balance_after": bal_after,
            "created_at": now,
            "created_by": user["_id"],
        }
        result = await db.customer_payments.insert_one(pay_doc)
        pay_doc["_id"] = result.inserted_id
        return PaymentPublic.from_doc(pay_doc)

    except Exception:
        # Compensating: restore sale fields + restore customer balance
        for sale_id, prev in reversed(sale_updates):
            await db.sales.update_one({"_id": sale_id}, {"$set": prev})
        await db.customers.update_one(
            {"_id": oid},
            {
                "$inc": {"balance": amount},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
        raise


@router.get("/{customer_id}", response_model=CustomerPublic)
async def get_customer(
    customer_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    doc = await db.customers.find_one({"_id": _customer_oid(customer_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return CustomerPublic.from_doc(doc)


@router.put("/{customer_id}", response_model=CustomerPublic)
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    oid = _customer_oid(customer_id)
    existing = await db.customers.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    email = body.email.strip() if body.email else None
    if email == "":
        email = None
    notes = body.notes.strip() if body.notes else None
    if notes == "":
        notes = None

    now = datetime.now(timezone.utc)
    # Do NOT update balance directly
    update = {
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "email": email,
        "notes": notes,
        "active": body.active,
        "updated_at": now,
    }
    await db.customers.update_one({"_id": oid}, {"$set": update})
    doc = await db.customers.find_one({"_id": oid})
    return CustomerPublic.from_doc(doc)


@router.delete("/{customer_id}", response_model=CustomerPublic)
async def delete_customer(
    customer_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    """Soft-delete: set active=false."""
    db = get_db(request)
    oid = _customer_oid(customer_id)
    existing = await db.customers.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    now = datetime.now(timezone.utc)
    await db.customers.update_one(
        {"_id": oid},
        {"$set": {"active": False, "updated_at": now}},
    )
    doc = await db.customers.find_one({"_id": oid})
    return CustomerPublic.from_doc(doc)
