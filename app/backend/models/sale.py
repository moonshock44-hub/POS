"""Sale models — PyObjectId for ids; never expose raw ObjectId in JSON."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

DeliveryStatus = Literal["pending", "assigned", "out", "delivered", "cancelled"]


class SaleLineIn(BaseModel):
    product_id: str = Field(min_length=1)
    qty: float = Field(gt=0)
    price: float = Field(ge=0)


class SaleCreate(BaseModel):
    lines: List[SaleLineIn] = Field(min_length=1)
    payment_method: Literal["cash", "card"]
    amount_paid: float = Field(ge=0)
    customer_id: Optional[str] = None
    delivery_driver_id: Optional[str] = None
    delivery_status: Optional[DeliveryStatus] = None

    @field_validator("lines")
    @classmethod
    def lines_non_empty(cls, v: List[SaleLineIn]) -> List[SaleLineIn]:
        if not v:
            raise ValueError("lines must not be empty")
        return v


class SaleDeliveryUpdate(BaseModel):
    """PATCH /api/sales/{id}/delivery — set driver and/or delivery status."""

    delivery_driver_id: Optional[str] = None
    delivery_status: Optional[DeliveryStatus] = None


class SaleLinePublic(BaseModel):
    product_id: str
    qty: float
    price: float
    line_total: float


class SalePublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    lines: List[SaleLinePublic]
    total: float
    payment_method: Literal["cash", "card"]
    amount_paid: float
    amount_due: float
    payment_status: Literal["paid", "partial"]
    change: float
    customer_id: Optional[str] = None
    delivery_driver_id: Optional[str] = None
    delivery_status: Optional[DeliveryStatus] = None
    folio: Optional[str] = None
    created_at: datetime
    created_by: str

    @classmethod
    def from_doc(cls, doc: dict) -> "SalePublic":
        lines = [
            SaleLinePublic(
                product_id=str(ln["product_id"]),
                qty=float(ln["qty"]),
                price=float(ln["price"]),
                line_total=float(ln["line_total"]),
            )
            for ln in doc.get("lines", [])
        ]
        cid = doc.get("customer_id")
        did = doc.get("delivery_driver_id")
        return cls(
            id=str(doc["_id"]),
            lines=lines,
            total=float(doc["total"]),
            payment_method=doc["payment_method"],
            amount_paid=float(doc["amount_paid"]),
            amount_due=float(doc.get("amount_due", 0)),
            payment_status=doc["payment_status"],
            change=float(doc.get("change", 0)),
            customer_id=str(cid) if cid is not None else None,
            delivery_driver_id=str(did) if did is not None else None,
            delivery_status=doc.get("delivery_status"),
            folio=doc.get("folio"),
            created_at=doc["created_at"],
            created_by=str(doc["created_by"]),
        )
