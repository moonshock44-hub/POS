"""Singleton settings — GET/PUT/PATCH /api/settings (F6 / JUA-15). Auth required."""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request

from models.settings import (
    SettingsPatch,
    SettingsPublic,
    SettingsPut,
    default_settings_fields,
)
from routes.auth import get_current_user, get_db, get_settings as get_app_settings, require_admin
from utils.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/settings", tags=["settings"])


def _deep_merge(base: dict, patch: dict) -> dict:
    """Merge patch into base; nested dicts are merged, other values replaced."""
    out = deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _domain_fields(doc: dict) -> dict:
    return {
        "business_name": doc.get("business_name"),
        "brand": deepcopy(doc.get("brand") or {}),
        "kiosk": deepcopy(doc.get("kiosk") or {}),
        "ticket": deepcopy(doc.get("ticket") or {}),
        "whatsapp": deepcopy(doc.get("whatsapp") or {}),
    }


async def _get_or_create(db) -> dict:
    doc = await db.settings.find_one({})
    if doc:
        return doc
    now = datetime.now(timezone.utc)
    fields = default_settings_fields()
    fields["created_at"] = now
    fields["updated_at"] = now
    result = await db.settings.insert_one(fields)
    fields["_id"] = result.inserted_id
    return fields


async def _replace_fields(db, existing: dict, fields: dict) -> dict:
    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {
        "business_name": fields["business_name"],
        "brand": fields["brand"],
        "kiosk": fields["kiosk"],
        "ticket": fields["ticket"],
        "whatsapp": fields["whatsapp"],
        "updated_at": now,
    }
    await db.settings.update_one({"_id": existing["_id"]}, {"$set": update})
    doc = await db.settings.find_one({"_id": existing["_id"]})
    return doc


@router.get("", response_model=SettingsPublic)
async def get_settings(
    request: Request,
    _user=Depends(get_current_user),
):
    """Return singleton settings; insert defaults if the collection is empty."""
    db = get_db(request)
    doc = await _get_or_create(db)
    return SettingsPublic.from_doc(doc)


@router.put("", response_model=SettingsPublic)
async def put_settings(
    body: SettingsPut,
    request: Request,
    _admin=Depends(require_admin),
):
    """Full replace of validated body; keeps the same _id."""
    app_settings = get_app_settings(request)
    enforce_rate_limit(
        request,
        bucket="settings_write",
        limit=int(app_settings.get("RATE_LIMIT_SETTINGS_WRITE_PER_MIN", 10)),
    )
    db = get_db(request)
    existing = await _get_or_create(db)
    fields = body.model_dump()
    doc = await _replace_fields(db, existing, fields)
    return SettingsPublic.from_doc(doc)


@router.patch("", response_model=SettingsPublic)
async def patch_settings(
    body: SettingsPatch,
    request: Request,
    _admin=Depends(require_admin),
):
    """Deep-merge partial updates for brand/kiosk/ticket/whatsapp (and business_name)."""
    app_settings = get_app_settings(request)
    enforce_rate_limit(
        request,
        bucket="settings_write",
        limit=int(app_settings.get("RATE_LIMIT_SETTINGS_WRITE_PER_MIN", 10)),
    )
    db = get_db(request)
    existing = await _get_or_create(db)
    patch = body.model_dump(exclude_unset=True)
    merged = _deep_merge(_domain_fields(existing), patch)
    # Re-validate merged document against the full PUT schema
    validated = SettingsPut.model_validate(merged)
    doc = await _replace_fields(db, existing, validated.model_dump())
    return SettingsPublic.from_doc(doc)
