#!/usr/bin/env node
/**
 * Garage MCP Server
 *
 * Exposes garage.db (vehicles, tasks, parts) as MCP tools so any
 * OpenClaw / Claude Code session can call them directly — no extra
 * Claude API round-trip required.
 *
 * Transport: stdio (standard for local MCP servers)
 * Register:  workspace/.mcp.json
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

// ── DB path resolution ────────────────────────────────────────────────────────

const __dir = path.dirname(fileURLToPath(import.meta.url));

function dbPath() {
  if (process.env.GARAGE_DB_PATH) return process.env.GARAGE_DB_PATH;
  return path.join(__dir, "garage.db");
}

function db() {
  const p = dbPath();
  const conn = new Database(p);
  conn.pragma("foreign_keys = ON");
  return conn;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vehicle";
}

// ── Vehicle lookup / create ───────────────────────────────────────────────────

function getOrCreateVehicleId(conn, name) {
  name = name.trim();
  if (!name) throw new Error("vehicle name is required");

  let row = conn.prepare(
    "SELECT id FROM vehicles WHERE name = ? COLLATE NOCASE"
  ).get(name);
  if (row) return row.id;

  const base = slugify(name);
  let unique = base;
  let n = 2;
  while (conn.prepare("SELECT 1 FROM vehicles WHERE shortname = ? COLLATE NOCASE").get(unique)) {
    unique = `${base}-${n++}`;
  }

  const info = conn.prepare(
    "INSERT INTO vehicles (name, category, shortname) VALUES (?, 'unknown', ?)"
  ).run(name, unique);
  return info.lastInsertRowid;
}

// ── Tool implementations ──────────────────────────────────────────────────────

function listVehicles() {
  const rows = db().prepare(
    "SELECT id, name, COALESCE(shortname,'') as sn, category FROM vehicles ORDER BY name COLLATE NOCASE"
  ).all();
  if (!rows.length) return "No vehicles in the database yet.";
  return "Vehicles:\n" + rows.map(r =>
    `- [${r.id}] ${r.name}${r.sn ? ` [${r.sn}]` : ""} (${r.category})`
  ).join("\n");
}

function getTasks({ car_name, include_completed = false }) {
  const conn = db();
  let sql = `
    SELECT t.id, v.name as vname, COALESCE(v.shortname,'') as sn,
           t.task_description, t.status, t.completed_miles, t.completed_at
    FROM tasks t JOIN vehicles v ON v.id = t.vehicle_id WHERE 1=1
  `;
  const params = [];
  if (!include_completed) { sql += " AND t.status != 'completed'"; }
  if (car_name?.trim()) {
    sql += " AND (v.name LIKE ? OR v.shortname LIKE ?)";
    const like = `%${car_name.trim()}%`;
    params.push(like, like);
  }
  sql += " ORDER BY t.status, t.modified_at DESC";
  const rows = conn.prepare(sql).all(...params);
  if (!rows.length) return "No tasks found.";
  const label = include_completed ? "Garage tasks" : "Open garage tasks";
  return label + ":\n" + rows.map(r => {
    const sn = r.sn ? ` [${r.sn}]` : "";
    const mi = r.completed_miles != null ? `, miles=${r.completed_miles}` : "";
    const dt = r.completed_at ? `, completed=${r.completed_at.slice(0, 10)}` : "";
    return `- [${r.id}] ${r.vname}${sn}: ${r.task_description} (${r.status}${mi}${dt})`;
  }).join("\n");
}

function addTask({ car_name, task }) {
  const conn = db();
  const vid = getOrCreateVehicleId(conn, car_name);
  const now = new Date().toISOString().slice(0, 19);
  conn.prepare(
    "INSERT INTO tasks (vehicle_id, task_description, status, modified_at) VALUES (?, ?, 'pending', ?)"
  ).run(vid, task.trim(), now);
  return `Added task for '${car_name}': "${task}" (pending).`;
}

function updateTaskStatus({ task_id, new_status, completed_miles }) {
  const STATUS_MAP = {
    done: "completed", complete: "completed", completed: "completed",
    pending: "pending", todo: "pending", open: "pending",
    in_progress: "in_progress", wip: "in_progress", doing: "in_progress",
  };
  const status = STATUS_MAP[new_status.toLowerCase().replace(/[ -]/g, "_")] ?? new_status;
  const now = new Date().toISOString().slice(0, 19);
  const conn = db();
  let info;
  if (status === "completed") {
    info = conn.prepare(
      "UPDATE tasks SET status=?, modified_at=?, completed_at=?, completed_miles=? WHERE id=?"
    ).run(status, now, now, completed_miles ?? null, task_id);
  } else {
    info = conn.prepare(
      "UPDATE tasks SET status=?, modified_at=?, completed_at=NULL, completed_miles=NULL WHERE id=?"
    ).run(status, now, task_id);
  }
  if (info.changes === 0) return `No task found with id=${task_id}.`;
  const mi = completed_miles != null ? `, miles=${completed_miles}` : "";
  return `Task ${task_id} → status=${status}${mi}.`;
}

function updateVehicle({ vehicle_id, category, make, model, year, notes, shortname }) {
  const sets = [];
  const params = [];

  if (category != null) { sets.push("category = ?"); params.push(category.trim()); }
  if (make != null)     { sets.push("make = ?");     params.push(make.trim()); }
  if (model != null)    { sets.push("model = ?");    params.push(model.trim()); }
  if (notes != null)    { sets.push("notes = ?");    params.push(notes.trim()); }
  if (year != null) {
    const y = parseInt(year);
    if (isNaN(y) || y < 1886 || y > 2100) return `Invalid year: ${year}`;
    sets.push("year = ?"); params.push(y);
  }
  if (shortname != null) {
    const conn = db();
    const base = slugify(shortname);
    const conflict = conn.prepare(
      "SELECT id FROM vehicles WHERE shortname = ? COLLATE NOCASE"
    ).get(base);
    if (conflict && conflict.id !== vehicle_id) {
      return `Shortname '${base}' already used by vehicle id=${conflict.id}.`;
    }
    sets.push("shortname = ?"); params.push(base);
  }
  if (!sets.length) return "No fields provided to update.";

  sets.push("modified_at = datetime('now')");
  params.push(vehicle_id);
  const info = db().prepare(
    `UPDATE vehicles SET ${sets.join(", ")} WHERE id = ?`
  ).run(...params);
  if (info.changes === 0) return `No vehicle found with id=${vehicle_id}.`;
  return `Vehicle ${vehicle_id} updated.`;
}

function addPart({ car_name, part_name, status, source, estimated_price, description }) {
  const st = status?.trim().toLowerCase();
  if (!["want", "purchased"].includes(st)) {
    return `Invalid status '${status}'. Use 'want' or 'purchased'.`;
  }
  const conn = db();
  const vid = getOrCreateVehicleId(conn, car_name);
  const now = new Date().toISOString().slice(0, 19);
  conn.prepare(
    `INSERT INTO parts (vehicle_id, part_name, status, source, estimated_price, description, created_at, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(vid, part_name.trim(), st, source ?? null, estimated_price ?? null, description ?? null, now, now);
  const price = estimated_price != null ? ` ~$${estimated_price}` : "";
  return `Added part '${part_name}' for '${car_name}' (status=${st}${price}).`;
}

function listParts({ car_name, status } = {}) {
  let sql = `
    SELECT p.id, v.name as vname, p.part_name, p.status, p.paid_price, p.source
    FROM parts p JOIN vehicles v ON v.id = p.vehicle_id WHERE 1=1
  `;
  const params = [];
  if (car_name?.trim()) {
    sql += " AND (v.name LIKE ? OR v.shortname LIKE ?)";
    const like = `%${car_name.trim()}%`;
    params.push(like, like);
  }
  if (status && ["want", "purchased"].includes(status.toLowerCase())) {
    sql += " AND p.status = ?";
    params.push(status.toLowerCase());
  }
  sql += " ORDER BY v.name COLLATE NOCASE, p.part_name COLLATE NOCASE LIMIT 101";
  const rows = db().prepare(sql).all(...params);
  const truncated = rows.length === 101;
  const display = truncated ? rows.slice(0, 100) : rows;
  if (!display.length) return "No parts match the filter.";
  const lines = ["Parts:", ...display.map(r => {
    const price = r.paid_price != null ? ` $${r.paid_price}` : "";
    const src = r.source ? ` @ ${r.source}` : "";
    return `- [${r.id}] ${r.vname} | ${r.part_name} | ${r.status}${price}${src}`;
  })];
  if (truncated) lines.push("(results truncated at 100 — use a filter to narrow)");
  return lines.join("\n");
}

// ── MCP tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_garage_vehicles",
    description: "List all vehicles and projects in the garage database.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_garage_tasks",
    description: "List garage tasks. Defaults to open tasks only. Set include_completed=true to see all.",
    inputSchema: {
      type: "object",
      properties: {
        car_name: { type: "string", description: "Optional vehicle name substring filter" },
        include_completed: { type: "boolean", description: "Include completed tasks" },
      },
    },
  },
  {
    name: "add_garage_task",
    description: "Add a pending task for a vehicle (creates vehicle if new).",
    inputSchema: {
      type: "object",
      properties: {
        car_name: { type: "string" },
        task: { type: "string" },
      },
      required: ["car_name", "task"],
    },
  },
  {
    name: "update_task_status",
    description: "Update a task status by its numeric ID. Get IDs from get_garage_tasks.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "integer" },
        new_status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        completed_miles: { type: "integer", description: "Odometer reading at completion" },
      },
      required: ["task_id", "new_status"],
    },
  },
  {
    name: "update_vehicle",
    description: "Update fields on a vehicle. Get vehicle IDs from list_garage_vehicles.",
    inputSchema: {
      type: "object",
      properties: {
        vehicle_id: { type: "integer" },
        category: { type: "string" },
        make: { type: "string" },
        model: { type: "string" },
        year: { type: "integer" },
        notes: { type: "string" },
        shortname: { type: "string" },
      },
      required: ["vehicle_id"],
    },
  },
  {
    name: "add_part",
    description: "Add a part to garage inventory. status='want' for wishlist, 'purchased' for owned.",
    inputSchema: {
      type: "object",
      properties: {
        car_name: { type: "string" },
        part_name: { type: "string" },
        status: { type: "string", enum: ["want", "purchased"] },
        source: { type: "string" },
        estimated_price: { type: "number" },
        description: { type: "string" },
      },
      required: ["car_name", "part_name", "status"],
    },
  },
  {
    name: "list_garage_parts",
    description: "List parts inventory, optionally filtered by vehicle name or status.",
    inputSchema: {
      type: "object",
      properties: {
        car_name: { type: "string" },
        status: { type: "string", enum: ["want", "purchased"] },
      },
    },
  },
];

// ── Server wiring ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "garage", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  let text;
  try {
    switch (name) {
      case "list_garage_vehicles": text = listVehicles(); break;
      case "get_garage_tasks":     text = getTasks(args); break;
      case "add_garage_task":      text = addTask(args); break;
      case "update_task_status":   text = updateTaskStatus(args); break;
      case "update_vehicle":       text = updateVehicle(args); break;
      case "add_part":             text = addPart(args); break;
      case "list_garage_parts":    text = listParts(args); break;
      default:                     text = `Unknown tool: ${name}`;
    }
  } catch (err) {
    text = `Error: ${err.message}`;
  }
  return { content: [{ type: "text", text }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
