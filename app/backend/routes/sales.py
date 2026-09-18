"""Sales — POST /api/sales with atomic stock + optional CxC; GET list/detail/receivables; PATCH delivery."""
from datetime import date
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from models.sale import SaleCreate, SaleDeliveryUpdate, SalePublic
from routes.auth import get_current_user, get_db
from routes.dashboard import _parse_ymd, _range_utc_window, _cdmx_day_utc_window
from utils.sale_service import create_sale_atomic

router = APIRouter(prefix="/sales", tags=["sales"])


def _sale_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return ObjectId(id_str)


@router.get("/receivables", response_model=List[SalePublic])
async def list_receivables(
    request: Request,
    _user=Depends(get_current_user),
    customer_id: Optional[str] = Query(
        default=None,
        description="Optional filter by customer_id",
    ),
):
    """List all sales with payment_status=partial (open CxC). Optional ?customer_id=."""
    db = get_db(request)
    query: dict = {"payment_status": "partial"}
    if customer_id is not None and customer_id != "":
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="customer_id inválido")
        query["customer_id"] = ObjectId(customer_id)
    cursor = db.sales.find(query).sort("created_at", 1)
    docs = await cursor.to_list(length=10_000)
    return [SalePublic.from_doc(d) for d in docs]


@router.get("", response_model=List[SalePublic])
async def list_sales(
    request: Request,
    _user=Depends(get_current_user),
    from_: Optional[str] = Query(
        default=None,
        alias="from",
        description="YYYY-MM-DD America/Mexico_City calendar day (inclusive start)",
    ),
    to: Optional[str] = Query(
        default=None,
        description="YYYY-MM-DD America/Mexico_City calendar day (inclusive end)",
    ),
    payment_status: Optional[str] = Query(
        default=None,
        description="Filter by payment_status (paid|partial)",
    ),
    payment_method: Optional[str] = Query(
        default=None,
        description="Filter by payment_method (cash|card)",
    ),
    customer_id: Optional[str] = Query(
        default=None,
        description="Filter by customer_id",
    ),
    delivery_status: Optional[str] = Query(
        default=None,
        description="Filter by delivery_status (pending|assigned|out|delivered|cancelled)",
    ),
    delivery_driver_id: Optional[str] = Query(
        default=None,
        description="Filter by delivery_driver_id",
    ),
    with_delivery: Optional[bool] = Query(
        default=None,
        description="If true, only sales with delivery_status or delivery_driver_id set",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    """
    List sales (F5 board + F8 Historial). Newest first.

    from/to are America/Mexico_City calendar days → inclusive UTC windows on created_at
    (same pattern as dashboard.py).
    """
    db = get_db(request)
    query: dict = {}

    from_d: Optional[date] = _parse_ymd(from_, "from") if from_ else None
    to_d: Optional[date] = _parse_ymd(to, "to") if to else None
    if from_d is not None and to_d is not None:
        if to_d < from_d:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="'to' debe ser >= 'from'",
            )
        start_utc, end_utc = _range_utc_window(from_d, to_d)
        query["created_at"] = {"$gte": start_utc, "$lte": end_utc}
    elif from_d is not None:
        start_utc, _ = _cdmx_day_utc_window(from_d)
        query["created_at"] = {"$gte": start_utc}
    elif to_d is not None:
        _, end_utc = _cdmx_day_utc_window(to_d)
        query["created_at"] = {"$lte": end_utc}

    if payment_status is not None and payment_status != "":
        allowed_ps = {"paid", "partial"}
        if payment_status not in allowed_ps:
            raise HTTPException(status_code=400, detail="payment_status inválido")
        query["payment_status"] = payment_status

    if payment_method is not None and payment_method != "":
        allowed_pm = {"cash", "card"}
        if payment_method not in allowed_pm:
            raise HTTPException(status_code=400, detail="payment_method inválido")
        query["payment_method"] = payment_method

    if customer_id is not None and customer_id != "":
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="customer_id inválido")
        query["customer_id"] = ObjectId(customer_id)

    if delivery_status is not None and delivery_status != "":
        allowed = {"pending", "assigned", "out", "delivered", "cancelled"}
        if delivery_status not in allowed:
            raise HTTPException(status_code=400, detail="delivery_status inválido")
        query["delivery_status"] = delivery_status
    if delivery_driver_id is not None and delivery_driver_id != "":
        if not ObjectId.is_valid(delivery_driver_id):
            raise HTTPException(status_code=400, detail="delivery_driver_id inválido")
        query["delivery_driver_id"] = ObjectId(delivery_driver_id)
    if with_delivery is True:
        query["$or"] = [
            {"delivery_status": {"$ne": None}},
            {"delivery_driver_id": {"$ne": None}},
        ]

    cursor = db.sales.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [SalePublic.from_doc(d) for d in docs]


@router.get("/{sale_id}", response_model=SalePublic)
async def get_sale(
    sale_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    """F8 Historial — single sale by id. Registered after /receivables so it does not capture that path."""
    db = get_db(request)
    oid = _sale_oid(sale_id)
    doc = await db.sales.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return SalePublic.from_doc(doc)


@router.post("", response_model=SalePublic, status_code=status.HTTP_201_CREATED)
async def create_sale(
    body: SaleCreate,
    request: Request,
    user=Depends(get_current_user),
):
    """
    Create a sale and atomically decrement stock per line.

    Uses findOneAndUpdate with stock/active conditions. On any line failure,
    previously decremented stock is rolled back and the sale is NOT persisted.
    (Standalone Mongo has no multi-doc transactions; compensating pattern guarantees
    no partial sale / no permanent partial stock change.)

    Payment: amount_paid >= total → paid (+ change); amount_paid < total → partial (crédito).
    Partial sales REQUIRE an active customer_id; balance is incremented by amount_due
    atomically with sale insert (compensating rollback on failure).

    Optional delivery_driver_id / delivery_status (F5).
    """
    db = get_db(request)
    lines = [
        {"product_id": ln.product_id, "qty": ln.qty, "price": ln.price}
        for ln in body.lines
    ]
    doc = await create_sale_atomic(
        db,
        lines=lines,
        payment_method=body.payment_method,
        amount_paid=body.amount_paid,
        customer_id=body.customer_id,
        created_by=user["_id"],
        delivery_driver_id=body.delivery_driver_id,
        delivery_status=body.delivery_status,
        origin="caja",
    )
    return SalePublic.from_doc(doc)


@router.patch("/{sale_id}/delivery", response_model=SalePublic)
async def patch_sale_delivery(
    sale_id: str,
    body: SaleDeliveryUpdate,
    request: Request,
    _user=Depends(get_current_user),
):
    """
    Set delivery_driver_id and/or delivery_status on a sale.
    When delivery_driver_id is a non-null id, driver must exist and be active.
    Pass delivery_driver_id: null to clear. Status enum:
    pending|assigned|out|delivered|cancelled (or omit / null to clear).
    """
    db = get_db(request)
    oid = _sale_oid(sale_id)
    existing = await db.sales.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    raw = body.model_dump(exclude_unset=True)
    if not raw:
        return SalePublic.from_doc(existing)

    update: dict = {}

    if "delivery_driver_id" in raw:
        did = raw["delivery_driver_id"]
        if did is None or did == "":
            update["delivery_driver_id"] = None
        else:
            if not ObjectId.is_valid(did):
                raise HTTPException(
                    status_code=400, detail="delivery_driver_id inválido"
                )
            driver_oid = ObjectId(did)
            driver = await db.deliveries.find_one({"_id": driver_oid})
            if not driver:
                raise HTTPException(
                    status_code=404, detail="Repartidor no encontrado"
                )
            if not driver.get("active", True):
                raise HTTPException(
                    status_code=400, detail="Repartidor inactivo"
                )
            update["delivery_driver_id"] = driver_oid

    if "delivery_status" in raw:
        update["delivery_status"] = raw["delivery_status"]

    if update:
        await db.sales.update_one({"_id": oid}, {"$set": update})

    doc = await db.sales.find_one({"_id": oid})
    return SalePublic.from_doc(doc)
