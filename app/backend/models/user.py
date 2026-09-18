from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .base import BaseDocument

Role = Literal["admin", "cajero", "despacho"]


class UserInDB(BaseDocument):
    email: EmailStr
    name: str
    hashed_password: str
    role: Role = "cajero"
    is_active: bool = True


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Role = "cajero"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    email: EmailStr
    name: str
    role: Role
    is_active: bool
    created_at: Optional[datetime] = None

    @classmethod
    def from_doc(cls, doc: dict) -> "UserPublic":
        return cls(
            id=str(doc["_id"]),
            email=doc["email"],
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
