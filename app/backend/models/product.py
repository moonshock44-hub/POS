"""Product models — PyObjectId for ids; never expose raw ObjectId in JSON."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .base import BaseDocument, PyObjectId


class ProductInDB(BaseDocument):
    name: str
    sku: str
    category: str
    unit: str
    stock: float = 0
    price: float = 0
    cost: float = 0
    image_url: Optional[str] = None
    active: bool = True


class ProductCreate(BaseModel):
    name: str = Field(min_length=1)
    sku: str = Field(min_length=1)
    category: str = Field(min_length=1)
    unit: str = Field(min_length=1)
    stock: float = 0
    price: float = 0
    cost: float = 0
    image_url: Optional[str] = None
    active: bool = True


class ProductUpdate(BaseModel):
    name: str = Field(min_length=1)
    sku: str = Field(min_length=1)
    category: str = Field(min_length=1)
    unit: str = Field(min_length=1)
    stock: float = 0
    price: float = 0
    cost: float = 0
    image_url: Optional[str] = None
    active: bool = True


class ProductPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    sku: str
    category: str
    unit: str
    stock: float
    price: float
    # Omitted (null) for cajero — margins/cost are admin-only.
    cost: Optional[float] = None
    image_url: Optional[str] = None
    active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_doc(cls, doc: dict, *, include_cost: bool = True) -> "ProductPublic":
        return cls(
            id=str(doc["_id"]),
            name=doc["name"],
            sku=doc["sku"],
            category=doc["category"],
            unit=doc["unit"],
            stock=float(doc.get("stock", 0)),
            price=float(doc.get("price", 0)),
            cost=float(doc.get("cost", 0)) if include_cost else None,
            image_url=doc.get("image_url"),
            active=bool(doc.get("active", True)),
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )


class ImageUploadResponse(BaseModel):
    image_url: str
