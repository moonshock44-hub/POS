"""Dispatch ticket models (F10 Despacho) — kitchen/counter queue, NOT deliveries."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


DispatchStatus = Literal["pending", "ready"]
DispatchOrigin = Literal["caja", "kiosko"]


class DispatchLinePublic(BaseModel):
    product_id: str
    name: str
    qty: float


class DispatchTicketPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    folio: str
    sale_id: str
    origin: DispatchOrigin
    status: DispatchStatus
    lines: List[DispatchLinePublic]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_doc(cls, doc: dict) -> "DispatchTicketPublic":
        lines = [
            DispatchLinePublic(
                product_id=str(ln["product_id"]),
                name=str(ln.get("name") or ""),
                qty=float(ln["qty"]),
            )
            for ln in doc.get("lines", [])
        ]
        return cls(
            id=str(doc["_id"]),
            folio=doc["folio"],
            sale_id=str(doc["sale_id"]),
            origin=doc["origin"],
            status=doc["status"],
            lines=lines,
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )


class DispatchTicketUpdate(BaseModel):
    """PATCH /api/despacho/{id} — set status pending|ready."""

    status: DispatchStatus
