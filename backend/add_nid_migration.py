import sqlite3

conn = sqlite3.connect('hr_crm.db')
cur = conn.cursor()

# Check if nid column already exists
cur.execute("PRAGMA table_info(employees)")
cols = [row[1] for row in cur.fetchall()]
print("Current columns:", cols)

if 'nid' not in cols:
    cur.execute("ALTER TABLE employees ADD COLUMN nid VARCHAR(50)")
    conn.commit()
    print("NID column added successfully!")
else:
    print("NID column already exists.")

conn.close()
