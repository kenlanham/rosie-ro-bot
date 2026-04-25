"""
Open WebUI tool — garage.db (vehicles, tasks, parts).

Paste this file directly into the Open WebUI Tools editor.
No external files needed; all helpers are inlined.

One required environment variable in your docker-compose.yml / .env:
  GARAGE_DB_PATH=C:/dev/ai-agent/garage.db

Task status values : pending | completed | in_progress
Parts status values: want | purchased
"""

from __future__ import annotations

import os
import re
import sqlite3
from datetime import datetime
from typing import Optional


# ── Helpers inlined from init_garage_db.py ───────────────────────────────────

def _slugify(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "vehicle"


def _lookup_vehicle_id(conn: sqlite3.Connection, name: str, shortname: Optional[str]) -> Optional[int]:
    name = name.strip()
    if shortname and shortname.strip():
        row = conn.execute(
            "SELECT id FROM vehicles WHERE shortname IS NOT NULL AND shortname = ? COLLATE NOCASE",
            (_slugify(shortname),),
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


def _get_or_create_vehicle_id(
    conn: sqlite3.Connection,
    name: str,
    shortname: Optional[str] = None,
    category: str = "unknown",
) -> int:
    name = name.strip()
    if not name:
        raise ValueError("vehicle name is required")
    existing = _lookup_vehicle_id(conn, name, shortname)
    if existing is not None:
        return existing
    base = _slugify(shortname) if shortname and shortname.strip() else _slugify(name)
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
        (name, category or "unknown", unique),
    )
    return cur.lastrowid


# ── Shared helpers ────────────────────────────────────────────────────────────

def _db_path() -> str:
    # 1. Explicit env var — highest priority
    path = os.environ.get("GARAGE_DB_PATH", "").strip()
    if path:
        return path
    # 2. Hard-coded project location — change this if your garage.db lives elsewhere
    hardcoded = r"C:\dev\ai-agent\garage.db"
    if os.path.exists(hardcoded):
        return hardcoded
    raise RuntimeError(
        f"garage.db not found. Set GARAGE_DB_PATH or update the hardcoded path "
        f"in garage_agent_tool.py (currently: {hardcoded})"
    )


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _normalize_task_status(raw: str) -> str:
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in ("completed", "complete", "done"):
        return "completed"
    if t in ("pending", "planned", "todo", "open"):
        return "pending"
    if t in ("in_progress", "inprogress", "wip", "doing"):
        return "in_progress"
    return raw.strip()


# ── Open WebUI Tools class ────────────────────────────────────────────────────

class Tools:
    def __init__(self):
        try:
            self.db_path = _db_path()
        except RuntimeError as e:
            self.db_path = f"(unset) {e}"

    def get_garage_tasks(
        self, car_name: Optional[str] = None, include_completed: bool = False
    ) -> str:
        """
        List garage tasks with vehicle name.
        car_name: optional substring filter on vehicle name or shortname.
        include_completed: if True, include completed tasks with their date and mileage.
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            sql = """
                SELECT t.id, v.name, COALESCE(v.shortname,''), t.task_description,
                       t.status, t.completed_miles, t.completed_at
                FROM tasks t
                JOIN vehicles v ON v.id = t.vehicle_id
                WHERE 1=1
            """
            if not include_completed:
                sql += " AND t.status != 'completed'"
            params: list = []
            if car_name and str(car_name).strip():
                sql += " AND (v.name LIKE ? OR v.shortname LIKE ?)"
                like = f"%{str(car_name).strip()}%"
                params.extend([like, like])
            sql += " ORDER BY t.status, t.modified_at DESC"
            rows = conn.execute(sql, params).fetchall()
            if not rows:
                return "No tasks found."
            label = "Garage tasks" if include_completed else "Open garage tasks"
            lines = [f"{label}:"]
            for tid, vname, shortn, desc, status, miles, completed_at in rows:
                sn = f" [{shortn}]" if shortn else ""
                mi = f", miles={miles}" if miles is not None else ""
                date = f", completed={completed_at[:10]}" if completed_at else ""
                lines.append(f"- [{tid}] {vname}{sn}: {desc} ({status}{mi}{date})")
            return "\n".join(lines)
        except Exception as e:
            return f"Database error: {e}"
        finally:
            conn.close()

    def add_garage_task(self, car_name: str, task: str) -> str:
        """
        Add a pending task for a vehicle.
        car_name: vehicle display name. Creates a new vehicles row if the name is new.
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            vid = _get_or_create_vehicle_id(conn, str(car_name).strip())
            now = datetime.now().isoformat(timespec="seconds")
            conn.execute(
                "INSERT INTO tasks (vehicle_id, task_description, status, modified_at) VALUES (?, ?, 'pending', ?)",
                (vid, str(task).strip(), now),
            )
            conn.commit()
            return f"Added task for '{car_name}': {task!r} (pending)."
        except Exception as e:
            conn.rollback()
            return f"Error adding task: {e}"
        finally:
            conn.close()

    def update_task_status(
        self, task_id: int, new_status: str = "completed", completed_miles: int = None
    ) -> str:
        """
        Update a task's status by its id (get id from get_garage_tasks).
        new_status: pending | completed | in_progress  (aliases: done, todo, wip).
        completed_miles: optional odometer reading when marking a task completed.
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            status = _normalize_task_status(new_status)
            now = datetime.now().isoformat(timespec="seconds")
            if status == "completed":
                cur = conn.execute(
                    "UPDATE tasks SET status=?, modified_at=?, completed_at=?, completed_miles=? WHERE id=?",
                    (status, now, now, completed_miles, task_id),
                )
            else:
                cur = conn.execute(
                    "UPDATE tasks SET status=?, modified_at=?, completed_at=NULL, completed_miles=NULL WHERE id=?",
                    (status, now, task_id),
                )
            conn.commit()
            if cur.rowcount == 0:
                return f"No task found with id={task_id}."
            miles_note = f", completed_miles={completed_miles}" if completed_miles is not None else ""
            return f"Task {task_id} → status={status}{miles_note}."
        except Exception as e:
            conn.rollback()
            return f"Error updating task: {e}"
        finally:
            conn.close()

    def list_garage_vehicles(self) -> str:
        """List all vehicles/projects: id, name, shortname, category."""
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            rows = conn.execute(
                "SELECT id, name, COALESCE(shortname,''), category FROM vehicles ORDER BY name COLLATE NOCASE"
            ).fetchall()
            if not rows:
                return "No vehicles in the database yet."
            lines = ["Vehicles:"]
            for vid, name, shortn, cat in rows:
                sn = f" [{shortn}]" if shortn else ""
                lines.append(f"- [{vid}] {name}{sn} ({cat})")
            return "\n".join(lines)
        except Exception as e:
            return f"Database error: {e}"
        finally:
            conn.close()

    def update_vehicle(
        self,
        vehicle_id: int,
        *,
        category: Optional[str] = None,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year: Optional[int] = None,
        notes: Optional[str] = None,
        shortname: Optional[str] = None,
    ) -> str:
        """
        Patch fields on a vehicles row. Only non-None fields are updated.
        Valid fields: category, make, model, year, notes, shortname.
        """
        updates: list[str] = []
        params: list[object] = []

        def _add(field: str, value: object) -> None:
            updates.append(f"{field} = ?")
            params.append(value)

        cat = (category or "").strip() if category is not None else None
        if cat is not None:
            if not cat:
                return "Category cannot be empty when provided."
            _add("category", cat)

        if make is not None:
            _add("make", make.strip())
        if model is not None:
            _add("model", model.strip())

        if year is not None:
            try:
                y = int(year)
            except (TypeError, ValueError):
                return f"Invalid year {year!r}."
            if y < 1886 or y > 2100:
                return f"Year {y} is out of supported range (1886–2100)."
            _add("year", y)

        if notes is not None:
            _add("notes", notes.strip())

        sn = (shortname or "").strip() if shortname is not None else None
        if sn is not None:
            if not sn:
                return "Shortname cannot be empty when provided."
            base = _slugify(sn)
            try:
                conn = _connect()
            except RuntimeError as e:
                return f"Config error: {e}"
            try:
                row = conn.execute(
                    "SELECT id FROM vehicles WHERE shortname IS NOT NULL AND shortname = ? COLLATE NOCASE",
                    (base,),
                ).fetchone()
                if row and row[0] != vehicle_id:
                    return (
                        f"Shortname '{base}' is already used by vehicle id={row[0]}. "
                        "Choose a different shortname."
                    )
                _add("shortname", base)
                updates.append("modified_at = datetime('now')")
                params.append()  # placeholder; will be ignored
            finally:
                conn.close()

        if not updates:
            return "No fields were provided to update."

        # Re-open connection for the actual update if we didn't already
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"

        # Always set modified_at
        if "modified_at = datetime('now')" not in updates:
            updates.append("modified_at = datetime('now')")

        sql = f"UPDATE vehicles SET {', '.join(updates)} WHERE id = ?"
        params = [p for p in params if p is not None]
        params.append(vehicle_id)

        try:
            cur = conn.execute(sql, params)
            conn.commit()
            if cur.rowcount == 0:
                return f"No vehicle found with id={vehicle_id}."
            return f"Vehicle {vehicle_id} updated."
        except Exception as e:
            conn.rollback()
            return f"Error updating vehicle: {e}"
        finally:
            conn.close()

    def update_vehicle_category(self, vehicle_id: int, category: str) -> str:
        """Backwards-compatible wrapper around update_vehicle for category-only changes."""
        return self.update_vehicle(vehicle_id, category=category)

    def add_part(
        self,
        car_name: str,
        part_name: str,
        status: str = "want",
        source: Optional[str] = None,
        estimated_price: Optional[float] = None,
        description: Optional[str] = None,
    ) -> str:
        """
        Add a part to the inventory for a vehicle.
        car_name: vehicle display name or shortname. Creates a new vehicle row if needed.
        status: want (wishlist) | purchased
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            st = str(status).strip().lower()
            if st not in ("want", "purchased"):
                return f"Invalid status {status!r}. Use 'want' or 'purchased'."
            vid = _get_or_create_vehicle_id(conn, str(car_name).strip())
            now = datetime.now().isoformat(timespec="seconds")
            conn.execute(
                """INSERT INTO parts
                   (vehicle_id, part_name, status, source, estimated_price, description, created_at, modified_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (vid, str(part_name).strip(), st, source, estimated_price, description, now, now),
            )
            conn.commit()
            price_s = f" ~${estimated_price:g}" if estimated_price is not None else ""
            return f"Added part '{part_name}' for '{car_name}' (status={st}{price_s})."
        except Exception as e:
            conn.rollback()
            return f"Error adding part: {e}"
        finally:
            conn.close()

    def update_part_status(self, part_id: int, new_status: str, paid_price: Optional[float] = None) -> str:
        """
        Update a part's status by its ID (get ID from list_garage_parts).
        new_status: want | purchased
        paid_price: optional actual price paid; recorded when marking as purchased.
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            st = str(new_status).strip().lower()
            if st not in ("want", "purchased"):
                return f"Invalid status {new_status!r}. Use 'want' or 'purchased'."
            now = datetime.now().isoformat(timespec="seconds")
            if st == "purchased":
                cur = conn.execute(
                    "UPDATE parts SET status=?, modified_at=?, paid_price=? WHERE id=?",
                    (st, now, paid_price, part_id),
                )
            else:
                cur = conn.execute(
                    "UPDATE parts SET status=?, modified_at=? WHERE id=?",
                    (st, now, part_id),
                )
            conn.commit()
            if cur.rowcount == 0:
                return f"No part found with id={part_id}."
            price_s = f", paid_price=${paid_price:g}" if paid_price is not None else ""
            return f"Part {part_id} → status={st}{price_s}."
        except Exception as e:
            conn.rollback()
            return f"Error updating part: {e}"
        finally:
            conn.close()

    def list_garage_parts(
        self,
        car_name: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> str:
        """
        List parts (max 100 rows).
        car_name: optional vehicle name/shortname substring filter.
        status_filter: want | purchased
        """
        try:
            conn = _connect()
        except RuntimeError as e:
            return f"Config error: {e}"
        try:
            sql = """
                SELECT p.id, v.name, p.part_name, p.status, p.paid_price, p.source
                FROM parts p
                JOIN vehicles v ON v.id = p.vehicle_id
                WHERE 1=1
            """
            params: list = []
            if car_name and str(car_name).strip():
                sql += " AND (v.name LIKE ? OR v.shortname LIKE ?)"
                like = f"%{str(car_name).strip()}%"
                params.extend([like, like])
            if status_filter:
                sf = str(status_filter).strip().lower()
                if sf in ("want", "purchased"):
                    sql += " AND p.status = ?"
                    params.append(sf)
            sql += " ORDER BY v.name COLLATE NOCASE, p.part_name COLLATE NOCASE LIMIT 101"
            rows = conn.execute(sql, params).fetchall()
            truncated = len(rows) == 101
            if truncated:
                rows = rows[:100]
            if not rows:
                return "No parts rows match the filter."
            lines = ["Parts:"]
            for pid, vname, pname, st, paid, src in rows:
                paid_s = f" ${paid:g}" if paid is not None else ""
                src_s = f" @ {src}" if src else ""
                lines.append(f"- [{pid}] {vname} | {pname} | {st}{paid_s}{src_s}")
            if truncated:
                lines.append("(results truncated at 100 — use a vehicle or status filter to narrow results)")
            return "\n".join(lines)
        except Exception as e:
            return f"Database error: {e}"
        finally:
            conn.close()
