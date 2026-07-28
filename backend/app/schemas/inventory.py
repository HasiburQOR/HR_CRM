from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class InventoryBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    item_code: str
    name: str
    category: str
    sub_category: Optional[str] = None
    description: Optional[str] = None
    item_type: str = "equipment"
    condition: Optional[str] = None
    location: Optional[str] = None
    unit_of_measure: str = "unit"
    quantity: int = 1
    minimum_stock: int = 0
    unit_cost: Optional[float] = 0.0
    serial_number: Optional[str] = None
    model_number: Optional[str] = None
    manufacturer: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_end_date: Optional[date] = None
    employee_id: Optional[str] = None
    assigned_at: Optional[date] = None
    assignment_notes: Optional[str] = None
    status: str = "in_stock"
    created_by: Optional[str] = None


class InventoryCreate(InventoryBase):
    pass


class InventoryUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    item_code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    description: Optional[str] = None
    item_type: Optional[str] = None
    condition: Optional[str] = None
    location: Optional[str] = None
    unit_of_measure: Optional[str] = None
    quantity: Optional[int] = None
    minimum_stock: Optional[int] = None
    unit_cost: Optional[float] = None
    serial_number: Optional[str] = None
    model_number: Optional[str] = None
    manufacturer: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_end_date: Optional[date] = None
    employee_id: Optional[str] = None
    assigned_at: Optional[date] = None
    assignment_notes: Optional[str] = None
    status: Optional[str] = None


class InventoryAssign(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    employee_id: str
    assigned_at: Optional[date] = None
    assignment_notes: Optional[str] = None


class InventoryResponse(InventoryBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    employee_name: Optional[str] = None
    employee_empid: Optional[str] = None
    employee_department: Optional[str] = None

    class Config:
        from_attributes = True
