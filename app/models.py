from pydantic import BaseModel
from typing import Optional, List

# User & Auth Models
class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Warehouse Staff"
    assigned_warehouse_id: Optional[int] = None

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetConfirm(BaseModel):
    email: str
    otp: str
    new_password: str

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    assigned_warehouse_id: Optional[int] = None

# Category Model
class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#714B67"

# Product Models
class ProductCreate(BaseModel):
    name: str
    sku: str
    category_id: Optional[int] = None
    uom: str = "Units"
    cost_price: float = 0.0
    sale_price: float = 0.0
    min_stock: float = 10.0
    max_stock: float = 100.0
    reorder_qty: float = 20.0
    barcode: Optional[str] = None
    description: Optional[str] = None
    initial_stock: Optional[float] = 0.0
    initial_location_id: Optional[int] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    uom: Optional[str] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    min_stock: Optional[float] = None
    max_stock: Optional[float] = None
    reorder_qty: Optional[float] = None
    barcode: Optional[str] = None
    description: Optional[str] = None

# Reordering Rule
class ReorderingRuleCreate(BaseModel):
    product_id: int
    warehouse_id: Optional[int] = None
    location_id: Optional[int] = None
    min_quantity: float
    max_quantity: float
    reorder_quantity: float

# Operations & Stock Movements
class OperationLineItem(BaseModel):
    product_id: int
    demanded_qty: float
    done_qty: Optional[float] = 0.0
    unit_price: Optional[float] = 0.0

class OperationCreate(BaseModel):
    op_type: str # 'receipt', 'delivery', 'internal', 'adjustment'
    partner_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    source_location_id: Optional[int] = None
    dest_location_id: Optional[int] = None
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None
    lines: List[OperationLineItem] = []

class StockAdjustmentCreate(BaseModel):
    product_id: int
    location_id: int
    counted_quantity: float
    reason: Optional[str] = "Physical Count Adjustment"

class QuickTransferCreate(BaseModel):
    product_id: int
    source_location_id: int
    dest_location_id: int
    quantity: float
    notes: Optional[str] = "Quick internal transfer"

class WarehouseCreate(BaseModel):
    code: str
    name: str
    address: Optional[str] = None

class LocationCreate(BaseModel):
    warehouse_id: Optional[int] = None
    code: str
    name: str
    location_type: str = "internal" # internal, vendor, customer, inventory_loss
