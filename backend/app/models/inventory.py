from sqlalchemy import Column, String, Float, Text, Date, DateTime, ForeignKey, Integer

from app.database import BaseModel


class InventoryItem(BaseModel):
    __tablename__ = "inventory_items"

    item_code = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)

    category = Column(String(100), nullable=False, index=True)
    sub_category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)

    item_type = Column(String(30), nullable=False, default="equipment")
    condition = Column(String(30), nullable=True)
    location = Column(String(255), nullable=True)

    unit_of_measure = Column(String(30), default="unit")
    quantity = Column(Integer, nullable=False, default=1)
    minimum_stock = Column(Integer, default=0)
    unit_cost = Column(Float, default=0.0)

    serial_number = Column(String(255), nullable=True)
    model_number = Column(String(255), nullable=True)
    manufacturer = Column(String(255), nullable=True)

    purchase_date = Column(Date, nullable=True)
    warranty_end_date = Column(Date, nullable=True)

    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=True)
    assigned_at = Column(Date, nullable=True)
    assignment_notes = Column(Text, nullable=True)

    status = Column(String(50), nullable=False, default="in_stock", index=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    deleted_at = Column(DateTime(timezone=True), nullable=True)


class InventoryAssignment(BaseModel):
    """A hand-out of stock units to an employee.

    Creating one decrements the item's stock (quantity); returning it
    puts the units back into stock.
    """
    __tablename__ = "inventory_assignments"

    item_id = Column(String(36), ForeignKey("inventory_items.id"), nullable=False, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    condition = Column(String(30), nullable=True)  # condition at handover
    assigned_at = Column(Date, nullable=True)
    returned_at = Column(Date, nullable=True)
    return_condition = Column(String(30), nullable=True)  # condition when returned
    status = Column(String(20), nullable=False, default="active", index=True)  # active | returned
    notes = Column(Text, nullable=True)

    deleted_at = Column(DateTime(timezone=True), nullable=True)
