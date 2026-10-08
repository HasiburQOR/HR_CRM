"""Additive, idempotent schema migrations shared by seed.py and app startup.

Nothing here drops or rewrites existing data; every step first checks whether
it is still needed, so running it on every boot is safe.
"""
from sqlalchemy import inspect, text

from app.models.inventory import InventoryAssignment

_ASSIGNMENTS = "inventory_assignments"
_ASSIGNMENTS_OLD = "inventory_assignments_old"


def migrate_inventory_department_assignments(engine) -> None:
    """Let an inventory hand-out target a department instead of an employee.

    Adds inventory_assignments.department and makes employee_id optional.
    """
    is_sqlite = engine.url.get_backend_name() == "sqlite"
    tables = inspect(engine).get_table_names()
    if _ASSIGNMENTS not in tables and _ASSIGNMENTS_OLD not in tables:
        return  # fresh database — create_all builds the table in its final shape

    if is_sqlite:
        _relax_sqlite_assignments(engine)
        return

    cols = {c["name"]: c for c in inspect(engine).get_columns(_ASSIGNMENTS)}
    with engine.begin() as conn:
        if "department" not in cols:
            conn.execute(text(f"ALTER TABLE {_ASSIGNMENTS} ADD COLUMN department VARCHAR(100)"))
            print("Added column: inventory_assignments.department")
        if not cols["employee_id"]["nullable"]:
            conn.execute(text(f"ALTER TABLE {_ASSIGNMENTS} ALTER COLUMN employee_id DROP NOT NULL"))
            print("Made column optional: inventory_assignments.employee_id")


def _relax_sqlite_assignments(engine) -> None:
    """SQLite cannot drop NOT NULL in place, so copy the rows into a rebuilt table.

    Each step is safe to repeat, so an interrupted run finishes on the next boot.
    """
    with engine.begin() as conn:
        tables = inspect(conn).get_table_names()
        if _ASSIGNMENTS_OLD not in tables:
            cols = {c["name"]: c for c in inspect(conn).get_columns(_ASSIGNMENTS)}
            if "department" not in cols:
                conn.execute(text(f"ALTER TABLE {_ASSIGNMENTS} ADD COLUMN department VARCHAR(100)"))
                print("Added column: inventory_assignments.department")
            if cols["employee_id"]["nullable"]:
                return
            # Index names are global in SQLite; free them for the rebuilt table.
            for ix in inspect(conn).get_indexes(_ASSIGNMENTS):
                conn.execute(text(f'DROP INDEX IF EXISTS "{ix["name"]}"'))
            conn.execute(text(f"ALTER TABLE {_ASSIGNMENTS} RENAME TO {_ASSIGNMENTS_OLD}"))

        InventoryAssignment.__table__.create(conn, checkfirst=True)
        old_cols = {c["name"] for c in inspect(conn).get_columns(_ASSIGNMENTS_OLD)}
        shared = ", ".join(c.name for c in InventoryAssignment.__table__.columns if c.name in old_cols)
        conn.execute(text(
            f"INSERT OR IGNORE INTO {_ASSIGNMENTS} ({shared}) SELECT {shared} FROM {_ASSIGNMENTS_OLD}"
        ))
        conn.execute(text(f"DROP TABLE {_ASSIGNMENTS_OLD}"))
        print("Made column optional: inventory_assignments.employee_id")
