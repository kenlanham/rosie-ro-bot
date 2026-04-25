"""Create garage.db: vehicles, tasks, and parts tables."""

import re
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "garage.db"


def slugify(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "vehicle"


def ensure_vehicles_table(conn: sqlite3.Connection) -> None:
    """Store each car, RC aircraft, heli, etc. shortname is a stable lookup key (unique when set)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            make TEXT,
            model TEXT,
            year INTEGER,
            notes TEXT,
            shortname TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)


def migrate_vehicles_columns(conn: sqlite3.Connection) -> None:
    cols = _table_columns(conn, "vehicles")
    if "shortname" not in cols:
        conn.execute("ALTER TABLE vehicles ADD COLUMN shortname TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_shortname ON vehicles(shortname)"
    )


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    return {row[1] for row in rows}


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def lookup_vehicle_id(
    conn: sqlite3.Connection,
    name: str,
    shortname: str | None,
) -> int | None:
    """Resolve an existing vehicle id by shortname or display name; no inserts."""
    name = name.strip()
    if shortname and shortname.strip():
        base = slugify(shortname)
        row = conn.execute(
            "SELECT id FROM vehicles WHERE shortname IS NOT NULL AND shortname = ? COLLATE NOCASE",
            (base,),
        ).fetchone()
        if row:
            return row[0]
    if name:
        row = conn.execute(
            "SELECT id FROM vehicles WHERE name = ? COLLATE NOCASE",
            (name,),
        ).fetchone()
        if row:
            return row[0]
    return None


def get_or_create_vehicle_id(
    conn: sqlite3.Connection,
    name: str,
    shortname: str | None = None,
) -> int:
    """Return vehicles.id, creating a row with a unique shortname if needed."""
    name = name.strip()
    if not name:
        raise ValueError("vehicle name is required")

    existing = lookup_vehicle_id(conn, name, shortname)
    if existing is not None:
        return existing

    base = slugify(shortname) if shortname and shortname.strip() else slugify(name)
    unique = base
    n = 2
    while conn.execute(
        "SELECT 1 FROM vehicles WHERE shortname IS NOT NULL AND shortname = ? COLLATE NOCASE",
        (unique,),
    ).fetchone():
        unique = f"{base}-{n}"
        n += 1

    cur = conn.execute(
        "INSERT INTO vehicles (name, category, shortname) VALUES (?, ?, ?)",
        (name, "unknown", unique),
    )
    return cur.lastrowid


def migrate_tasks_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to tasks when upgrading an older garage.db."""
    cols = _table_columns(conn, "tasks")
    statements: list[str] = []
    if "created_at" not in cols:
        statements.append(
            "ALTER TABLE tasks ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))"
        )
    if "modified_at" not in cols:
        statements.append(
            "ALTER TABLE tasks ADD COLUMN modified_at TEXT NOT NULL DEFAULT (datetime('now'))"
        )
    if "completed_at" not in cols:
        statements.append("ALTER TABLE tasks ADD COLUMN completed_at TEXT")
    for sql in statements:
        conn.execute(sql)
    _migrate_mileage_to_completed_miles(conn)


def _migrate_mileage_to_completed_miles(conn: sqlite3.Connection) -> None:
    cols = _table_columns(conn, "tasks")
    if "completed_miles" in cols:
        return
    if "mileage" in cols:
        conn.execute("ALTER TABLE tasks RENAME COLUMN mileage TO completed_miles")
    else:
        conn.execute("ALTER TABLE tasks ADD COLUMN completed_miles REAL")


def migrate_tasks_vehicle_fk(conn: sqlite3.Connection) -> None:
    """Move tasks from vehicle_name text to vehicle_id FK; rebuild table to enforce FK."""
    cols = _table_columns(conn, "tasks")
    if "vehicle_name" not in cols:
        return

    if "vehicle_id" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN vehicle_id INTEGER")

    rows = conn.execute(
        "SELECT id, vehicle_name FROM tasks WHERE vehicle_id IS NULL"
    ).fetchall()
    for tid, vname in rows:
        if not (vname or "").strip():
            raise ValueError(f"task id {tid} has empty vehicle_name")
        vid = get_or_create_vehicle_id(conn, vname.strip(), None)
        conn.execute(
            "UPDATE tasks SET vehicle_id = ? WHERE id = ?",
            (vid, tid),
        )

    conn.execute("DROP TABLE IF EXISTS tasks__new")
    conn.execute("""
        CREATE TABLE tasks__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
            task_description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            completed_miles REAL
        )
    """)
    conn.execute("""
        INSERT INTO tasks__new (
            id, vehicle_id, task_description, status,
            created_at, modified_at, completed_at, completed_miles
        )
        SELECT
            id, vehicle_id, task_description, status,
            created_at, modified_at, completed_at, completed_miles
        FROM tasks
    """)
    conn.execute("DROP TABLE tasks")
    conn.execute("ALTER TABLE tasks__new RENAME TO tasks")


def ensure_tasks_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
            task_description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            completed_miles REAL
        )
    """)
    migrate_tasks_columns(conn)
    migrate_tasks_vehicle_fk(conn)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_id ON tasks(vehicle_id)")


def migrate_parts_columns(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "parts"):
        return
    cols = _table_columns(conn, "parts")
    if "status" not in cols:
        conn.execute(
            "ALTER TABLE parts ADD COLUMN status TEXT NOT NULL DEFAULT 'want'"
        )
    if "modified_at" not in cols:
        conn.execute("ALTER TABLE parts ADD COLUMN modified_at TEXT")
        conn.execute(
            """
            UPDATE parts SET modified_at = COALESCE(created_at, datetime('now'))
            WHERE modified_at IS NULL
            """
        )


def migrate_parts_enforce_vehicle_fk(conn: sqlite3.Connection) -> None:
    """Rebuild parts so vehicle_id is NOT NULL with FK to vehicles (prototype migration)."""
    if not _table_exists(conn, "parts"):
        return
    info = {row[1]: row for row in conn.execute("PRAGMA table_info(parts)").fetchall()}
    if "vehicle_id" not in info:
        return
    if info["vehicle_id"][3] == 1:
        return
    orphans = conn.execute(
        "SELECT COUNT(*) FROM parts WHERE vehicle_id IS NULL"
    ).fetchone()[0]
    if orphans:
        pid = get_or_create_vehicle_id(conn, "Unassigned", "unassigned")
        conn.execute(
            "UPDATE parts SET vehicle_id = ? WHERE vehicle_id IS NULL",
            (pid,),
        )
    conn.execute("DROP TABLE IF EXISTS parts__new")
    conn.execute("""
        CREATE TABLE parts__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
            part_name TEXT NOT NULL,
            source TEXT,
            estimated_price REAL,
            paid_price REAL,
            description TEXT,
            goal_notes TEXT,
            status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'purchased')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        INSERT INTO parts__new (
            id, vehicle_id, part_name, source, estimated_price, paid_price,
            description, goal_notes, status, created_at, modified_at
        )
        SELECT
            id, vehicle_id, part_name, source, estimated_price, paid_price,
            description, goal_notes, status, created_at,
            COALESCE(modified_at, created_at)
        FROM parts
    """)
    conn.execute("DROP TABLE parts")
    conn.execute("ALTER TABLE parts__new RENAME TO parts")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parts_vehicle ON parts(vehicle_id)")


def ensure_parts_table(conn: sqlite3.Connection) -> None:
    """Parts belong to a vehicle/project via vehicle_id FK to vehicles(id)."""
    if _table_exists(conn, "wishlist_parts") and not _table_exists(conn, "parts"):
        conn.execute("ALTER TABLE wishlist_parts RENAME TO parts")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
            part_name TEXT NOT NULL,
            source TEXT,
            estimated_price REAL,
            paid_price REAL,
            description TEXT,
            goal_notes TEXT,
            status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'purchased')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    migrate_parts_columns(conn)
    migrate_parts_enforce_vehicle_fk(conn)
    conn.execute("DROP INDEX IF EXISTS idx_wishlist_parts_vehicle")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parts_vehicle ON parts(vehicle_id)")


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    ensure_vehicles_table(conn)
    migrate_vehicles_columns(conn)
    ensure_tasks_table(conn)
    ensure_parts_table(conn)


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        conn.commit()
        print(f"Database ready: {DB_PATH}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
