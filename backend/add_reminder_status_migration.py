"""Migration: Add status column to reminders table."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hr_crm.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print("Database not found, skipping migration.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if status column already exists
    cursor.execute("PRAGMA table_info(reminders)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "status" not in columns:
        cursor.execute("ALTER TABLE reminders ADD COLUMN status VARCHAR(20) DEFAULT 'ongoing'")
        print("Added 'status' column to reminders table.")
    else:
        print("'status' column already exists in reminders table.")
    
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()