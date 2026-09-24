import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .base import BaseDocument

Role = Literal["admin", "cajero", "despacho"]

USERNAME_RE = re.compile(r"^[a-z0-9_.-]{3,32}$")


def _normalize_username(v: str) -> str:
    v = v.strip().lower()
    if not USERNAME_RE.match(v):
        raise ValueError(
            "Usuario inválido: 3-32 caracteres, minúsculas/números/._- (sin espacios)"
        )
    return v


class UserInDB(BaseDocument):
    username: str
    name: str
    hashed_password: str
    role: Role = "cajero"
    is_active: bool = True


class UserCreate(BaseModel):
    username: str
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Role = "cajero"

    @field_validator("username")
    @classmethod
    def _v_username(cls, v: str) -> str:
        return _normalize_username(v)


class UserLogin(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _v_username(cls, v: str) -> str:
        return _normalize_username(v)


class UserUpdate(BaseModel):
    """Admin-only partial update — role and/or active status."""

    role: Optional[Role] = None
    is_active: Optional[bool] = None


class UserPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    username: str
    name: str
    role: Role
    is_active: bool
    created_at: Optional[datetime] = None

    @classmethod
    def from_doc(cls, doc: dict) -> "UserPublic":
        return cls(
            id=str(doc["_id"]),
            username=doc["username"],
            name=doc["name"],
            role=doc["role"],
            is_active=doc.get("is_active", True),
            created_at=doc.get("created_at"),
        )


class TokenResponse(BaseModel):
    """Login/register response. Session is the HttpOnly cookie — SPA must not store JWT.

    `access_token` is omitted for web cookie sessions. Smoke scripts should use
    curl cookie jars (-c/-b) or send Bearer only if they obtained a token another way.
    """
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserPublic
