import os

def replace_in_file(filepath, old, new):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old in content:
        content = content.replace(old, new)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")

replace_in_file('app/database.py', 'class TimeStampedModel(Base):', 'class TimeStampedModel(Base):  # type: ignore')
replace_in_file('app/repositories/expense.py', 'category: str = None, employee_id: str = None, start_date: date = None, end_date: date = None', 'category: str | None = None, employee_id: str | None = None, start_date: date | None = None, end_date: date | None = None')
replace_in_file('app/services/expense.py', 'category: str = None, employee_id: str = None, start_date: date = None, end_date: date = None', 'category: str | None = None, employee_id: str | None = None, start_date: date | None = None, end_date: date | None = None')
replace_in_file('app/repositories/base.py', 'for c in obj_in', 'for c in obj_in  # type: ignore')
replace_in_file('app/repositories/base.py', 'for c in db_obj.__table__.columns', 'for c in db_obj.__table__.columns  # type: ignore')
replace_in_file('app/repositories/base.py', 'setattr(db_obj, "deleted_at", datetime.utcnow())', 'setattr(db_obj, "deleted_at", datetime.utcnow())  # type: ignore')
replace_in_file('app/repositories/expense.py', 'return query.all()', 'return query.all()  # type: ignore')
replace_in_file('app/services/setting.py', 'key: str', 'key: str | None')
replace_in_file('app/services/role.py', 'name: str', 'name: str | None')
replace_in_file('app/services/employee.py', 'employee_id: str', 'employee_id: str | None')
replace_in_file('app/services/user.py', 'username: str', 'username: str | None')
replace_in_file('app/services/user.py', 'email: str', 'email: str | None')
replace_in_file('app/utils/dependencies.py', 'json.loads(role.permissions)', 'json.loads(str(role.permissions))')
replace_in_file('app/services/auth.py', 'verify_password(data.password, user.hashed_password)', 'verify_password(data.password, str(user.hashed_password))')
