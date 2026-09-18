"""Drivers / repartidores CRUD — path /api/deliveries (F5 / JUA-12). Auth required."""
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from models.driver import DriverCreate, DriverPublic, DriverUpdate
from routes.auth import get_current_user, get_db

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


def _driver_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repartidor no encontrado",
        )
    return ObjectId(id_str)


def _opt_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = value.strip()
    return s if s else None


@router.get("", response_model=List[DriverPublic])
async def list_drivers(
    request: Request,
    _user=Depends(get_current_user),
    active: Optional[bool] = Query(
        default=True,
        description="Default true = only active. Pass false to include inactive.",
    ),
):
    """List drivers (repartidores). By default only active; ?active=false includes inactive."""
    db = get_db(request)
    query: dict = {}
    if active is True:
        query["active"] = True
    cursor = db.deliveries.find(query).sort("name", 1)
    docs = await cursor.to_list(length=10_000)
    return [DriverPublic.from_doc(d) for d in docs]


@router.post("", response_model=DriverPublic, status_code=status.HTTP_201_CREATED)
async def create_driver(
    body: DriverCreate,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    name = body.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name es requerido",
        )
    now = datetime.now(timezone.utc)
    doc = {
        "name": name,
        "phone": _opt_str(body.phone),
        "notes": _opt_str(body.notes),
        "active": body.active,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.deliveries.insert_one(doc)
    doc["_id"] = result.inserted_id
    return DriverPublic.from_doc(doc)


@router.get("/{driver_id}", response_model=DriverPublic)
async def get_driver(
    driver_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    doc = await db.deliveries.find_one({"_id": _driver_oid(driver_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repartidor no encontrado",
        )
    return DriverPublic.from_doc(doc)


@router.put("/{driver_id}", response_model=DriverPublic)
async def update_driver(
    driver_id: str,
    body: DriverUpdate,
    request: Request,
    _user=Depends(get_current_user),
):
    db = get_db(request)
    oid = _driver_oid(driver_id)
    existing = await db.deliveries.find_one({"_id": oid})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repartidor no encontrado",
        )
    name = body.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name es requerido",
        )
    now = datetime.now(timezone.utc)
    update = {
        "name": name,
        "phone": _opt_str(body.phone),
        "notes": _opt_str(body.notes),
        "active": body.active,
        "updated_at": now,
    }
    await db.deliveries.update_one({"_id": oid}, {"$set": update})
    doc = await db.deliveries.find_one({"_id": oid})
    return DriverPublic.from_doc(doc)


@router.delete("/{driver_id}", response_model=DriverPublic)
async def delete_driver(
    driver_id: str,
    request: Request,
    _user=Depends(get_current_user),
):
    """Soft-delete: set active=false."""
    db = get_db(request)
    oid = _driver_oid(driver_id)
    existing = await db.deliveries.find_one({"_id": oid})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repartidor no encontrado",
        )
    now = datetime.now(timezone.utc)
    await db.deliveries.update_one(
        {"_id": oid},
        {"$set": {"active": False, "updated_at": now}},
    )
    doc = await db.deliveries.find_one({"_id": oid})
    return DriverPublic.from_doc(doc)
