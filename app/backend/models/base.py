"""Shared Pydantic/Mongo helpers — never expose raw bson.ObjectId in JSON."""
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, GetCoreSchemaHandler
from pydantic_core import core_schema


class PyObjectId(ObjectId):
    """ObjectId that serializes to str in JSON responses."""

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source_type: Any, _handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        def validate(value: Any) -> ObjectId:
            if isinstance(value, ObjectId):
                return value
            if isinstance(value, str) and ObjectId.is_valid(value):
                return ObjectId(value)
            raise ValueError("Invalid ObjectId")

        return core_schema.no_info_plain_validator_function(
            validate,
            serialization=core_schema.to_string_ser_schema(),
        )

    @classmethod
    def __get_pydantic_json_schema__(cls, _core_schema: Any, handler: Any) -> dict:
        return {"type": "string"}


class BaseDocument(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    id: Annotated[PyObjectId, Field(alias="_id")] = Field(default_factory=PyObjectId)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
