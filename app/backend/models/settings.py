"""Settings models (F6 / JUA-15) — singleton. PyObjectId → str for id. No store/prefs."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

HEX_COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"
COUNTRY_CODE_PATTERN = r"^\d+$"

DEFAULT_WHATSAPP_TEMPLATE = (
    "Hola, aquí está tu ticket de {business_name}. Total: {total}"
)

DEFAULT_BRAND = {
    "primary_color": "#ff8a7a",
    "secondary_color": "#c9b1ff",
    "accent_color": "#ffe66d",
}


class BrandSettings(BaseModel):
    primary_color: str = Field(default=DEFAULT_BRAND["primary_color"], pattern=HEX_COLOR_PATTERN)
    secondary_color: str = Field(
        default=DEFAULT_BRAND["secondary_color"], pattern=HEX_COLOR_PATTERN
    )
    accent_color: str = Field(default=DEFAULT_BRAND["accent_color"], pattern=HEX_COLOR_PATTERN)


class KioskSettings(BaseModel):
    welcome_text: Optional[str] = "¡Bienvenido! Escoge tus productos"
    logo_url: Optional[str] = None


class TicketSettings(BaseModel):
    footer: Optional[str] = "¡Gracias por su compra!"
    show_sku: bool = True
    show_change: bool = True


class WhatsAppSettings(BaseModel):
    enabled: bool = False
    default_country_code: str = Field(default="52", pattern=COUNTRY_CODE_PATTERN)
    message_template: Optional[str] = DEFAULT_WHATSAPP_TEMPLATE


class BrandPatch(BaseModel):
    primary_color: Optional[str] = Field(default=None, pattern=HEX_COLOR_PATTERN)
    secondary_color: Optional[str] = Field(default=None, pattern=HEX_COLOR_PATTERN)
    accent_color: Optional[str] = Field(default=None, pattern=HEX_COLOR_PATTERN)


class KioskPatch(BaseModel):
    welcome_text: Optional[str] = None
    logo_url: Optional[str] = None


class TicketPatch(BaseModel):
    footer: Optional[str] = None
    show_sku: Optional[bool] = None
    show_change: Optional[bool] = None


class WhatsAppPatch(BaseModel):
    enabled: Optional[bool] = None
    default_country_code: Optional[str] = Field(default=None, pattern=COUNTRY_CODE_PATTERN)
    message_template: Optional[str] = None


class SettingsPut(BaseModel):
    """Full replace body for PUT /api/settings."""

    business_name: str = Field(min_length=1)
    brand: BrandSettings
    kiosk: KioskSettings
    ticket: TicketSettings
    whatsapp: WhatsAppSettings

    @field_validator("business_name")
    @classmethod
    def name_non_empty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("business_name es requerido")
        return s


class SettingsPatch(BaseModel):
    """Partial body for PATCH /api/settings — deep-merged into singleton."""

    business_name: Optional[str] = None
    brand: Optional[BrandPatch] = None
    kiosk: Optional[KioskPatch] = None
    ticket: Optional[TicketPatch] = None
    whatsapp: Optional[WhatsAppPatch] = None

    @field_validator("business_name")
    @classmethod
    def name_non_empty_if_set(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        s = v.strip()
        if not s:
            raise ValueError("business_name es requerido")
        return s


class SettingsPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    business_name: str
    brand: BrandSettings
    kiosk: KioskSettings
    ticket: TicketSettings
    whatsapp: WhatsAppSettings
    updated_at: datetime

    @classmethod
    def from_doc(cls, doc: dict) -> "SettingsPublic":
        return cls(
            id=str(doc["_id"]),
            business_name=doc["business_name"],
            brand=BrandSettings.model_validate(doc.get("brand") or {}),
            kiosk=KioskSettings.model_validate(doc.get("kiosk") or {}),
            ticket=TicketSettings.model_validate(doc.get("ticket") or {}),
            whatsapp=WhatsAppSettings.model_validate(doc.get("whatsapp") or {}),
            updated_at=doc["updated_at"],
        )


def default_settings_fields() -> dict:
    """Canonical default document fields (no _id)."""
    return {
        "business_name": "Tiendita",
        "brand": DEFAULT_BRAND.copy(),
        "kiosk": {
            "welcome_text": "¡Bienvenido! Escoge tus productos",
            "logo_url": None,
        },
        "ticket": {
            "footer": "¡Gracias por su compra!",
            "show_sku": True,
            "show_change": True,
        },
        "whatsapp": {
            "enabled": False,
            "default_country_code": "52",
            "message_template": DEFAULT_WHATSAPP_TEMPLATE,
        },
    }
