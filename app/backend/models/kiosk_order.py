"""Kiosk order models — public create; cashier fulfill/list. PyObjectId → str."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.sale import SalePublic


class KioskLineIn(BaseModel):
    product_id: str = Field(min_length=1)
    qty: float = Field(gt=0)


class KioskOrderCreate(BaseModel):
    lines: List[KioskLineIn] = Field(min_length=1)
    customer_name: Optional[str] = None
    note: Optional[str] = None

    @field_validator("lines")
    @classmethod
    def lines_non_empty(cls, v: List[KioskLineIn]) -> List[KioskLineIn]:
        if not v:
            raise ValueError("lines must not be empty")
        return v


class KioskLinePublic(BaseModel):
    product_id: str
    product_name: str
    qty: float
    price: float
    line_total: float


class KioskOrderPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    lines: List[KioskLinePublic]
    total: float
    customer_name: Optional[str] = None
    note: Optional[str] = None
    status: Literal["pending", "fulfilled", "cancelled"] = "pending"
    sale_id: Optional[str] = None
    created_at: datetime

    @classmethod
    def from_doc(cls, doc: dict) -> "KioskOrderPublic":
        lines = [
            KioskLinePublic(
                product_id=str(ln["product_id"]),
                product_name=str(ln.get("product_name", "")),
                qty=float(ln["qty"]),
                price=float(ln["price"]),
                line_total=float(ln["line_total"]),
            )
            for ln in doc.get("lines", [])
        ]
        sid = doc.get("sale_id")
        return cls(
            id=str(doc["_id"]),
            lines=lines,
            total=float(doc["total"]),
            customer_name=doc.get("customer_name"),
            note=doc.get("note"),
            status=doc.get("status", "pending"),
            sale_id=str(sid) if sid is not None else None,
            created_at=doc["created_at"],
        )


class KioskPendingCount(BaseModel):
    count: int


class KioskFulfillBody(BaseModel):
    payment_method: Literal["cash", "card"]
    amount_paid: float = Field(ge=0)
    customer_id: Optional[str] = None


class KioskFulfillResponse(BaseModel):
    order: KioskOrderPublic
    sale: SalePublic
