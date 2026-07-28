from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from sqlalchemy.orm import Session
from sqlalchemy import inspect

from app.database import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


def _column_keys(model_cls: type[ModelType]) -> set[str]:
    return {c.key for c in inspect(model_cls).mapper.column_attrs}


def _filter_kwargs(model_cls: type[ModelType], data: dict[str, Any]) -> dict[str, Any]:
    allowed = _column_keys(model_cls)
    return {k: v for k, v in data.items() if k in allowed}


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: type[ModelType], db: Session):
        self.model = model
        self.db = db

    def get(self, id: str) -> ModelType | None:
        return self.db.query(self.model).filter(self.model.id == id).first()

    def get_all(self, skip: int = 0, limit: int = 100, **filters) -> list[ModelType]:
        query = self.db.query(self.model)
        allowed = _column_keys(self.model)
        for key, value in filters.items():
            if key in allowed and value is not None:
                query = query.filter(getattr(self.model, key) == value)
        return query.offset(skip).limit(limit).all()

    def create(self, obj_in: dict[str, Any] | BaseModel) -> ModelType:
        if isinstance(obj_in, BaseModel):
            data = {c.key: getattr(obj_in, c.key) for c in inspect(obj_in).mapper.column_attrs}
        else:
            data = _filter_kwargs(self.model, dict(obj_in))
        db_obj = self.model(**data)
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update(self, id: str, obj_in: dict[str, Any] | BaseModel) -> ModelType | None:
        db_obj = self.get(id)
        if not db_obj:
            return None
        allowed = _column_keys(self.model)
        if isinstance(obj_in, BaseModel):
            update_data = {c.key: getattr(obj_in, c.key) for c in inspect(obj_in).mapper.column_attrs if getattr(obj_in, c.key) is not None}
        else:
            update_data = {k: v for k, v in obj_in.items() if k in allowed and v is not None}
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        if hasattr(db_obj, 'updated_at'):
            db_obj.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete(self, id: str) -> bool:
        db_obj = self.get(id)
        if not db_obj:
            return False
        if hasattr(db_obj, "deleted_at"):
            db_obj.deleted_at = datetime.now(timezone.utc)
            self.db.commit()
            return True
        return self.hard_delete(id)

    def hard_delete(self, id: str) -> bool:
        db_obj = self.get(id)
        if not db_obj:
            return False
        self.db.delete(db_obj)
        self.db.commit()
        return True
