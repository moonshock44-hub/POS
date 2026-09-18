"""Dashboard summary models (F7 / JUA-13) — CDMX calendar days. CANON field names only."""
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SalesBucket(BaseModel):
    count: int = 0
    gross_total: float = 0.0
    amount_paid_total: float = 0.0
    amount_due_total: float = 0.0


class PaymentMethodStat(BaseModel):
    method: Literal["cash", "card"]
    count: int = 0
    gross_total: float = 0.0
    amount_paid_total: float = 0.0


class SalesBlock(BaseModel):
    today: SalesBucket = Field(default_factory=SalesBucket)
    month: SalesBucket = Field(default_factory=SalesBucket)
    range: SalesBucket = Field(default_factory=SalesBucket)


class DayPoint(BaseModel):
    date: str
    count: int = 0
    gross_total: float = 0.0


class ProductSoldStat(BaseModel):
    product_id: str
    name: str
    sku: str
    qty_sold: float = 0.0
    revenue: float = 0.0


class ProductsBlock(BaseModel):
    top: List[ProductSoldStat] = Field(default_factory=list)
    least: List[ProductSoldStat] = Field(default_factory=list)


class LowStockItem(BaseModel):
    id: str
    name: str
    sku: str
    stock: float
    unit: str


class InventoryBlock(BaseModel):
    low_stock_count: int = 0
    low_stock_threshold: float = 5.0
    items: List[LowStockItem] = Field(default_factory=list)


class CxcBlock(BaseModel):
    open_count: int = 0
    open_balance: float = 0.0


class DashboardSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    timezone: str = "America/Mexico_City"
    sales: SalesBlock
    payment_methods: List[PaymentMethodStat] = Field(default_factory=list)
    products: ProductsBlock = Field(default_factory=ProductsBlock)
    series: List[DayPoint] = Field(default_factory=list)
    inventory: InventoryBlock = Field(default_factory=InventoryBlock)
    cxc: CxcBlock = Field(default_factory=CxcBlock)
