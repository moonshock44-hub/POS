"""Driver / repartidor models (F5) — exposed via /api/deliveries. PyObjectId → str."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DriverCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class DriverUpdate(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class DriverPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_doc(cls, doc: dict) -> "DriverPublic":
        return cls(
            id=str(doc["_id"]),
            name=doc["name"],
            phone=doc.get("phone"),
            notes=doc.get("notes"),
            active=bool(doc.get("active", True)),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )
