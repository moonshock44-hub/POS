"""Dashboard summary — GET /api/dashboard/summary (F7 / JUA-13). Auth required.

Calendar days use America/Mexico_City; Mongo filters use converted UTC windows.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from models.dashboard import (
    CxcBlock,
    DashboardSummary,
    DayPoint,
    InventoryBlock,
    LowStockItem,
    PaymentMethodStat,
    ProductSoldStat,
    ProductsBlock,
    SalesBlock,
    SalesBucket,
)
from routes.auth import get_current_user, get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

TZ_NAME = "America/Mexico_City"
CDMX = ZoneInfo(TZ_NAME)
UTC = timezone.utc
DATE_FMT = "%Y-%m-%d"
DEFAULT_THRESHOLD = 5.0
LOW_STOCK_LIMIT = 50
PRODUCT_RANK_LIMIT = 10


def _parse_ymd(value: str, field: str) -> date:
    try:
        return datetime.strptime(value, DATE_FMT).date()
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field} debe ser YYYY-MM-DD",
        ) from exc


def _cdmx_day_utc_window(d: date) -> tuple[datetime, datetime]:
    """Inclusive CDMX calendar day → [start, end] as UTC-aware datetimes."""
    start_local = datetime(d.year, d.month, d.day, 0, 0, 0, 0, tzinfo=CDMX)
    end_local = datetime(d.year, d.month, d.day, 23, 59, 59, 999000, tzinfo=CDMX)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _cdmx_month_utc_window(d: date) -> tuple[datetime, datetime]:
    """Current CDMX calendar month through end of today CDMX → UTC window."""
    first = date(d.year, d.month, 1)
    start_utc, _ = _cdmx_day_utc_window(first)
    _, end_utc = _cdmx_day_utc_window(d)
    return start_utc, end_utc


def _range_utc_window(from_d: date, to_d: date) -> tuple[datetime, datetime]:
    start_utc, _ = _cdmx_day_utc_window(from_d)
    _, end_utc = _cdmx_day_utc_window(to_d)
    return start_utc, end_utc


async def _sales_bucket(db, start: datetime, end: datetime) -> SalesBucket:
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "gross_total": {"$sum": "$total"},
                "amount_paid_total": {"$sum": "$amount_paid"},
                "amount_due_total": {"$sum": "$amount_due"},
            }
        },
    ]
    rows = await db.sales.aggregate(pipeline).to_list(length=1)
    if not rows:
        return SalesBucket()
    r = rows[0]
    return SalesBucket(
        count=int(r.get("count", 0)),
        gross_total=float(r.get("gross_total") or 0),
        amount_paid_total=float(r.get("amount_paid_total") or 0),
        amount_due_total=float(r.get("amount_due_total") or 0),
    )


async def _payment_methods(db, start: datetime, end: datetime) -> list[PaymentMethodStat]:
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": "$payment_method",
                "count": {"$sum": 1},
                "gross_total": {"$sum": "$total"},
                "amount_paid_total": {"$sum": "$amount_paid"},
            }
        },
    ]
    rows = await db.sales.aggregate(pipeline).to_list(length=20)
    by_m = {r.get("_id"): r for r in rows}
    out: list[PaymentMethodStat] = []
    for method in ("cash", "card"):
        r = by_m.get(method) or {}
        out.append(
            PaymentMethodStat(
                method=method,
                count=int(r.get("count", 0) or 0),
                gross_total=float(r.get("gross_total") or 0),
                amount_paid_total=float(r.get("amount_paid_total") or 0),
            )
        )
    return out



async def _series(
    db, from_d: date, to_d: date, start: datetime, end: datetime
) -> list[DayPoint]:
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$created_at",
                        "timezone": TZ_NAME,
                    }
                },
                "count": {"$sum": 1},
                "gross_total": {"$sum": "$total"},
            }
        },
    ]
    rows = await db.sales.aggregate(pipeline).to_list(length=10_000)
    by_date = {
        r["_id"]: (int(r.get("count", 0)), float(r.get("gross_total") or 0))
        for r in rows
    }
    out: list[DayPoint] = []
    cur = from_d
    while cur <= to_d:
        key = cur.isoformat()
        count, gross = by_date.get(key, (0, 0.0))
        out.append(DayPoint(date=key, count=count, gross_total=gross))
        cur += timedelta(days=1)
    return out


async def _product_ranks(
    db, start: datetime, end: datetime
) -> tuple[list[ProductSoldStat], list[ProductSoldStat]]:
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {"$unwind": "$lines"},
        {
            "$group": {
                "_id": "$lines.product_id",
                "qty": {"$sum": "$lines.qty"},
                "gross": {
                    "$sum": {
                        "$ifNull": [
                            "$lines.line_total",
                            {"$multiply": ["$lines.qty", "$lines.price"]},
                        ]
                    }
                },
            }
        },
        {"$sort": {"qty": -1, "gross": -1, "_id": 1}},
    ]
    rows = await db.sales.aggregate(pipeline).to_list(length=10_000)
    if not rows:
        return [], []

    oids: list[ObjectId] = []
    for r in rows:
        pid = r["_id"]
        if isinstance(pid, ObjectId):
            oids.append(pid)
        elif ObjectId.is_valid(str(pid)):
            oids.append(ObjectId(str(pid)))

    meta: dict[str, dict] = {}
    if oids:
        async for doc in db.products.find({"_id": {"$in": oids}}, {"name": 1, "sku": 1}):
            meta[str(doc["_id"])] = {
                "name": doc.get("name") or "—",
                "sku": doc.get("sku") or "",
            }

    stats: list[ProductSoldStat] = []
    for r in rows:
        pid = str(r["_id"])
        m = meta.get(pid, {"name": "—", "sku": ""})
        stats.append(
            ProductSoldStat(
                product_id=pid,
                name=m["name"],
                sku=m["sku"],
                qty_sold=float(r.get("qty") or 0),
                revenue=float(r.get("gross") or 0),
            )
        )

    top = stats[:PRODUCT_RANK_LIMIT]
    least = sorted(stats, key=lambda s: (s.qty_sold, s.revenue, s.product_id))[:PRODUCT_RANK_LIMIT]
    return top, least


async def _inventory(db, threshold: float) -> InventoryBlock:
    query = {"active": True, "stock": {"$lte": threshold}}
    low_stock_count = await db.products.count_documents(query)
    docs = (
        await db.products.find(query)
        .sort("stock", 1)
        .limit(LOW_STOCK_LIMIT)
        .to_list(length=LOW_STOCK_LIMIT)
    )
    items = [
        LowStockItem(
            id=str(d["_id"]),
            name=d.get("name") or "—",
            sku=d.get("sku") or "",
            stock=float(d.get("stock") or 0),
            unit=d.get("unit") or "pza",
        )
        for d in docs
    ]
    return InventoryBlock(
        low_stock_count=int(low_stock_count),
        low_stock_threshold=float(threshold),
        items=items,
    )


async def _cxc(db) -> CxcBlock:
    open_count = await db.sales.count_documents({"payment_status": "partial"})
    pipeline = [
        {"$group": {"_id": None, "open_balance": {"$sum": {"$ifNull": ["$balance", 0]}}}},
    ]
    rows = await db.customers.aggregate(pipeline).to_list(length=1)
    open_balance = float((rows[0].get("open_balance") if rows else 0) or 0)
    return CxcBlock(open_count=int(open_count), open_balance=open_balance)


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    request: Request,
    _user=Depends(get_current_user),
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    threshold: float = Query(default=DEFAULT_THRESHOLD, ge=0),
):
    """
    F7 dashboard KPIs.

    from/to are America/Mexico_City calendar days (default = today CDMX).
    Filters on sale.created_at use the converted inclusive UTC windows.
    """
    db = get_db(request)
    today_cdmx = datetime.now(CDMX).date()
    month_start_d = date(today_cdmx.year, today_cdmx.month, 1)

    to_d = _parse_ymd(to, "to") if to else today_cdmx
    from_d = _parse_ymd(from_, "from") if from_ else date(to_d.year, to_d.month, 1)
    if to_d < from_d:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' debe ser >= 'from'",
        )

    today_start, today_end = _cdmx_day_utc_window(today_cdmx)
    # month bucket = CDMX calendar month of `to`
    month_start, month_end = _cdmx_month_utc_window(to_d)
    range_start, range_end = _range_utc_window(from_d, to_d)

    sales_today = await _sales_bucket(db, today_start, today_end)
    sales_month = await _sales_bucket(db, month_start, month_end)
    sales_range = await _sales_bucket(db, range_start, range_end)
    payment_methods = await _payment_methods(db, range_start, range_end)
    series = await _series(db, from_d, to_d, range_start, range_end)
    top, least = await _product_ranks(db, range_start, range_end)
    inventory = await _inventory(db, float(threshold))
    cxc = await _cxc(db)

    return DashboardSummary.model_validate(
        {
            "from": from_d.isoformat(),
            "to": to_d.isoformat(),
            "timezone": TZ_NAME,
            "sales": {
                "today": sales_today.model_dump(),
                "month": sales_month.model_dump(),
                "range": sales_range.model_dump(),
            },
            "payment_methods": [p.model_dump() for p in payment_methods],
            "products": {
                "top": [p.model_dump() for p in top],
                "least": [p.model_dump() for p in least],
            },
            "series": [p.model_dump() for p in series],
            "inventory": inventory.model_dump(),
            "cxc": cxc.model_dump(),
        }
    )
