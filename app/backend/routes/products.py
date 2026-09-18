"""Products CRUD + image upload — reads: any auth; mutations/upload: admin only (JUA-17)."""
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status

from models.product import (
    ImageUploadResponse,
    ProductCreate,
    ProductPublic,
    ProductUpdate,
)
from routes.auth import get_current_user, get_db, get_settings, require_admin
from utils.rate_limit import enforce_rate_limit
from utils.storage import upload_product_image

router = APIRouter(prefix="/products", tags=["products"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="ID inválido")
    return ObjectId(id_str)


def _include_cost(user: dict) -> bool:
    return user.get("role") == "admin"


@router.get("", response_model=List[ProductPublic], response_model_exclude_none=True)
async def list_products(
    request: Request,
    user=Depends(get_current_user),
    active: Optional[bool] = Query(
        default=True,
        description="Default true = only active. Pass false to include inactive.",
    ),
):
    """List products. By default only active; ?active=false includes inactive.
    Cajero: `cost` stripped. Admin: full fields."""
    db = get_db(request)
    query: dict = {}
    if active is True:
        query["active"] = True
    cursor = db.products.find(query).sort("name", 1)
    docs = await cursor.to_list(length=10_000)
    inc = _include_cost(user)
    return [ProductPublic.from_doc(d, include_cost=inc) for d in docs]


@router.post("/upload", response_model=ImageUploadResponse)
async def upload_image(
    request: Request,
    file: Annotated[UploadFile, File(..., description="Image file (multipart field: file)")],
    _admin=Depends(require_admin),
):
    """Upload product image — admin only. Returns {image_url}. Never Base64 in Mongo."""
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="upload",
        limit=int(settings.get("RATE_LIMIT_UPLOAD_PER_MIN", 10)),
    )
    url = await upload_product_image(file, settings)
    return ImageUploadResponse(image_url=url)


@router.get("/{product_id}", response_model=ProductPublic, response_model_exclude_none=True)
async def get_product(
    product_id: str,
    request: Request,
    user=Depends(get_current_user),
):
    db = get_db(request)
    doc = await db.products.find_one({"_id": _oid(product_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return ProductPublic.from_doc(doc, include_cost=_include_cost(user))


@router.post("", response_model=ProductPublic, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    request: Request,
    _admin=Depends(require_admin),
):
    db = get_db(request)
    sku = body.sku.strip()
    existing = await db.products.find_one({"sku": sku})
    if existing:
        raise HTTPException(status_code=400, detail="SKU ya existe")

    now = datetime.now(timezone.utc)
    doc = {
        "name": body.name.strip(),
        "sku": sku,
        "category": body.category.strip(),
        "unit": body.unit.strip(),
        "stock": float(body.stock),
        "price": float(body.price),
        "cost": float(body.cost),
        "image_url": body.image_url,
        "active": body.active,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.products.insert_one(doc)
    doc["_id"] = result.inserted_id
    return ProductPublic.from_doc(doc)


@router.put("/{product_id}", response_model=ProductPublic)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    request: Request,
    _admin=Depends(require_admin),
):
    db = get_db(request)
    oid = _oid(product_id)
    existing = await db.products.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    sku = body.sku.strip()
    dup = await db.products.find_one({"sku": sku, "_id": {"$ne": oid}})
    if dup:
        raise HTTPException(status_code=400, detail="SKU ya existe")

    now = datetime.now(timezone.utc)
    update = {
        "name": body.name.strip(),
        "sku": sku,
        "category": body.category.strip(),
        "unit": body.unit.strip(),
        "stock": float(body.stock),
        "price": float(body.price),
        "cost": float(body.cost),
        "image_url": body.image_url,
        "active": body.active,
        "updated_at": now,
    }
    await db.products.update_one({"_id": oid}, {"$set": update})
    doc = await db.products.find_one({"_id": oid})
    return ProductPublic.from_doc(doc)


@router.delete("/{product_id}", response_model=ProductPublic)
async def delete_product(
    product_id: str,
    request: Request,
    _admin=Depends(require_admin),
):
    """Soft-delete: set active=false — admin only."""
    db = get_db(request)
    oid = _oid(product_id)
    existing = await db.products.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    now = datetime.now(timezone.utc)
    await db.products.update_one(
        {"_id": oid},
        {"$set": {"active": False, "updated_at": now}},
    )
    doc = await db.products.find_one({"_id": oid})
    return ProductPublic.from_doc(doc)
