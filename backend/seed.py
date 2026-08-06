from app.database import engine, Base, SessionLocal
import app.models  # Import ALL models so Base.metadata.create_all creates every table
from app.models.user import User
from app.models.role import Role
from app.utils.security import hash_password

Base.metadata.create_all(bind=engine)

# Migrate: add missing columns to existing tables
from sqlalchemy import text, inspect
db = SessionLocal()
try:
    inspector = inspect(engine)
    if "salaries" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("salaries")]
        with engine.begin() as conn:
            if "gross_salary" not in cols:
                conn.execute(text("ALTER TABLE salaries ADD COLUMN gross_salary FLOAT DEFAULT 0.0"))
                print("Added column: salaries.gross_salary")
            if "notes" not in cols:
                conn.execute(text("ALTER TABLE salaries ADD COLUMN notes VARCHAR(500)"))
                print("Added column: salaries.notes")
    if "reminders" in inspector.get_table_names():
        rcols = [c["name"] for c in inspector.get_columns("reminders")]
        with engine.begin() as conn:
            if "status" not in rcols:
                conn.execute(text("ALTER TABLE reminders ADD COLUMN status VARCHAR(20) DEFAULT 'ongoing'"))
                print("Added column: reminders.status")
    if "requisitions" in inspector.get_table_names():
        qcols = [c["name"] for c in inspector.get_columns("requisitions")]
        with engine.begin() as conn:
            if "duration_days" not in qcols:
                conn.execute(text("ALTER TABLE requisitions ADD COLUMN duration_days INTEGER"))
                print("Added column: requisitions.duration_days")
finally:
    db.close()

db = SessionLocal()
try:
    # Seed roles
    roles_data = [
        {"name": "Admin", "description": "Full System Control"},
        {"name": "CEO", "description": "Executive Access & All Approval Controls"},
        {"name": "HR", "description": "Human Resources, Account Creation & Approval Controls"},
        {"name": "Manager", "description": "Departmental Manager"},
        {"name": "Employee", "description": "Standard Employee Access"},
    ]

    roles_map = {}
    for r in roles_data:
        existing_role = db.query(Role).filter(Role.name == r["name"]).first()
        if not existing_role:
            new_role = Role(name=r["name"], permissions="{}")
            db.add(new_role)
            db.commit()
            db.refresh(new_role)
            roles_map[r["name"]] = new_role
        else:
            roles_map[r["name"]] = existing_role

    # Seed Admin User
    existing = db.query(User).filter(User.username == "admin").first()
    if existing:
        print("Admin user already exists.")
    else:
        user = User(
            username="admin",
            email="admin@hrcrm.com",
            hashed_password=hash_password("admin123"),
            full_name="System Admin",
            is_superuser=True,
            is_active=True,
            role_id=roles_map.get("Admin").id if roles_map.get("Admin") else None,
        )
        db.add(user)
        db.commit()
        print("Admin user created:")
        print("  Username: admin")
        print("  Password: admin123")

    # Seed HR User
    hr_user = db.query(User).filter(User.username == "hr").first()
    if not hr_user:
        hr = User(
            username="hr",
            email="hr@hrcrm.com",
            hashed_password=hash_password("hr123"),
            full_name="HR Manager",
            is_superuser=False,
            is_active=True,
            role_id=roles_map.get("HR").id if roles_map.get("HR") else None,
        )
        db.add(hr)
        db.commit()
        print("HR user created:")
        print("  Username: hr")
        print("  Password: hr123")

    # Seed CEO User
    ceo_user = db.query(User).filter(User.username == "ceo").first()
    if not ceo_user:
        ceo = User(
            username="ceo",
            email="ceo@hrcrm.com",
            hashed_password=hash_password("ceo123"),
            full_name="Chief Executive Officer",
            is_superuser=False,
            is_active=True,
            role_id=roles_map.get("CEO").id if roles_map.get("CEO") else None,
        )
        db.add(ceo)
        db.commit()
        print("CEO user created:")
        print("  Username: ceo")
        print("  Password: ceo123")

finally:
    db.close()
