"""Customer + CxC payment models — PyObjectId for ids; never expose raw ObjectId in JSON."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .sale import SalePublic


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class CustomerUpdate(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class CustomerPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    phone: str
    email: Optional[str] = None
    notes: Optional[str] = None
    balance: float
    active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_doc(cls, doc: dict) -> "CustomerPublic":
        return cls(
            id=str(doc["_id"]),
            name=doc["name"],
            phone=doc["phone"],
            email=doc.get("email"),
            notes=doc.get("notes"),
            balance=float(doc.get("balance", 0)),
            active=bool(doc.get("active", True)),
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: Literal["cash", "card"]
    note: Optional[str] = None


class PaymentApplied(BaseModel):
    sale_id: str
    amount: float


class PaymentPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    customer_id: str
    amount: float
    payment_method: Literal["cash", "card"]
    note: Optional[str] = None
    applied_to: List[PaymentApplied]
    balance_after: float
    created_at: datetime
    created_by: str

    @classmethod
    def from_doc(cls, doc: dict) -> "PaymentPublic":
        applied = [
            PaymentApplied(sale_id=str(a["sale_id"]), amount=float(a["amount"]))
            for a in doc.get("applied_to", [])
        ]
        return cls(
            id=str(doc["_id"]),
            customer_id=str(doc["customer_id"]),
            amount=float(doc["amount"]),
            payment_method=doc["payment_method"],
            note=doc.get("note"),
            applied_to=applied,
            balance_after=float(doc["balance_after"]),
            created_at=doc["created_at"],
            created_by=str(doc["created_by"]),
        )


class AccountStatement(BaseModel):
    """GET /api/customers/{id}/account response."""

    customer: CustomerPublic
    open_sales: List[SalePublic]
    payments: List[PaymentPublic]
