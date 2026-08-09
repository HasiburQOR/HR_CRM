import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect

from app.database import engine, Base
from app.routes import auth, user, employee, attendance, salary, leave, task, reminder, backup, role, activity_log, setting, dashboard, reports, expense, inventory, requisition
from app.middleware.auth_middleware import AuthContextMiddleware
from app.middleware.audit_middleware import AuditMiddleware

app = FastAPI(title="HR CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthContextMiddleware)
app.add_middleware(AuditMiddleware)

app.include_router(auth.router)
app.include_router(user.router)
app.include_router(employee.router)
app.include_router(attendance.router)
app.include_router(salary.router)
app.include_router(leave.router)
app.include_router(task.router)
app.include_router(reminder.router)
app.include_router(backup.router)
app.include_router(role.router)
app.include_router(activity_log.router)
app.include_router(setting.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(expense.router)
app.include_router(inventory.router)
app.include_router(requisition.router)


def _is_sqlite() -> bool:
    return engine.url.get_backend_name() == "sqlite"


def _column_exists(conn, table: str, column: str) -> bool:
    if _is_sqlite():
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(str(row[1]).lower() == column.lower() for row in rows)
    else:
        rows = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column},
        ).fetchall()
        return bool(rows)


def _add_column_if_missing(conn, table: str, column: str, definition: str) -> None:
    if not _column_exists(conn, table, column):
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def _rebuild_reminders_table_sqlite(conn) -> None:
    try:
        existing_rows = conn.execute(text("PRAGMA table_info(reminders)")).fetchall()
        existing_cols = [str(r[1]).lower() for r in existing_rows]
        has_not_null_remind_at = any(
            str(r[1]).lower() == "remind_at" and int(r[3] or 0) == 1 for r in existing_rows
        )
        missing_cols = {"reminder_date", "reminder_time", "is_completed", "remind_at", "is_sent"} - set(existing_cols)
        if not has_not_null_remind_at and not missing_cols:
            return
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS reminders_new (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    reminder_date DATE,
                    reminder_time VARCHAR(10),
                    is_completed BOOLEAN DEFAULT 0,
                    remind_at DATETIME,
                    is_sent BOOLEAN DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            )
        )
        safe_cols = [
            c for c in ["id", "user_id", "title", "description",
                        "reminder_date", "reminder_time",
                        "is_completed", "remind_at", "is_sent",
                        "created_at", "updated_at"] if c in existing_cols
        ]
        if safe_cols:
            conn.execute(
                text(
                    f"INSERT INTO reminders_new ({', '.join(safe_cols)}) "
                    f"SELECT {', '.join(safe_cols)} FROM reminders"
                )
            )
        conn.execute(text("DROP TABLE IF EXISTS reminders"))
        conn.execute(text("ALTER TABLE reminders_new RENAME TO reminders"))
    except Exception:
        pass


def _run_sqlite_migrations() -> None:
    if not _is_sqlite():
        return
    try:
        with engine.connect() as conn:
            _add_column_if_missing(conn, "expenses", "custom_category", "VARCHAR(200)")
            _add_column_if_missing(conn, "expenses", "rejected_by", "VARCHAR(36)")

            _add_column_if_missing(conn, "attendances", "approved_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "attendances", "rejected_by", "VARCHAR(36)")

            # Requisition expense approval workflow
            _add_column_if_missing(conn, "requisition_expenses", "status", "VARCHAR(20) DEFAULT 'pending'")
            _add_column_if_missing(conn, "requisition_expenses", "approved_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "requisition_expenses", "rejected_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "requisition_expenses", "updated_at", "DATETIME")

            _add_column_if_missing(conn, "salaries", "basic_salary", "FLOAT DEFAULT 0.0")
            _add_column_if_missing(conn, "salaries", "month", "VARCHAR(20) DEFAULT ''")
            _add_column_if_missing(conn, "salaries", "year", "INTEGER DEFAULT 2026")
            _add_column_if_missing(conn, "salaries", "net_salary", "FLOAT DEFAULT 0.0")
            _add_column_if_missing(conn, "salaries", "payment_date", "VARCHAR(50)")
            _add_column_if_missing(conn, "salaries", "status", "VARCHAR(20) DEFAULT 'pending'")
            _add_column_if_missing(conn, "salaries", "approved_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "salaries", "working_days", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "salaries", "days_attended", "INTEGER DEFAULT 0")
            try:
                conn.execute(text("UPDATE salaries SET basic_salary = base_salary WHERE basic_salary IS NULL OR basic_salary = 0"))
            except Exception:
                pass

            _rebuild_reminders_table_sqlite(conn)

            try:
                conn.execute(
                    text(
                        "UPDATE reminders SET remind_at = CASE "
                        "WHEN reminder_date IS NOT NULL THEN datetime(reminder_date, COALESCE(reminder_time, '09:00')) "
                        "ELSE datetime('now') END "
                        "WHERE remind_at IS NULL"
                    )
                )
            except Exception:
                pass

            conn.commit()
    except Exception:
        pass


def _run_postgres_migrations() -> None:
    """Run one-time idempotent migrations for PostgreSQL."""
    if _is_sqlite():
        return
    with engine.connect() as conn:
        # Requisition expense approval workflow (must run first & commit independently)
        try:
            _add_column_if_missing(conn, "requisition_expenses", "status", "VARCHAR(20) DEFAULT 'pending'")
            _add_column_if_missing(conn, "requisition_expenses", "approved_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "requisition_expenses", "rejected_by", "VARCHAR(36)")
            _add_column_if_missing(conn, "requisition_expenses", "updated_at", "TIMESTAMP")
            conn.commit()
        except Exception:
            pass

        # Add salary columns: working_days and days_attended
        try:
            _add_column_if_missing(conn, "salaries", "working_days", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "salaries", "days_attended", "INTEGER DEFAULT 0")
            conn.commit()
        except Exception:
            pass

        # Migrate tasks.assigned_to FK from users.id → employees.id
        try:
            fk_rows = conn.execute(text("""
                SELECT tc.constraint_name, ccu.table_name AS foreign_table
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_name = 'tasks'
                    AND kcu.column_name = 'assigned_to'
            """)).fetchall()

            for row in fk_rows:
                fk_name = row[0]
                foreign_table = row[1]
                if foreign_table == "users":
                    # Nullify stale user-id values (they won't exist in employees)
                    conn.execute(text("""
                        UPDATE tasks
                        SET assigned_to = NULL
                        WHERE assigned_to IS NOT NULL
                            AND assigned_to NOT IN (SELECT id FROM employees)
                    """))
                    # Drop old FK and add new one pointing to employees
                    conn.execute(text(f'ALTER TABLE tasks DROP CONSTRAINT "{fk_name}"'))
                    conn.execute(text("""
                        ALTER TABLE tasks
                        ADD CONSTRAINT tasks_assigned_to_fkey
                        FOREIGN KEY (assigned_to) REFERENCES employees(id)
                    """))
                    conn.commit()
                    break
        except Exception:
            pass




@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _run_sqlite_migrations()
    _run_postgres_migrations()

    # Serve uploaded files at /uploads/
    uploads_root = "/app/uploads"
    os.makedirs(uploads_root, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_root), name="uploads")


@app.get("/health")
def health_check():
    return {"status": "ok"}
