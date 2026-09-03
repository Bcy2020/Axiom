/**
 * Acceptance-Driven MCP v0.1 — SQLite Store
 * Uses Node's built-in `node:sqlite` (DatabaseSync) — no native build required.
 * Tables mirror the forward-direction schema.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = ".acceptance";
const DB_FILE = "acceptance.db";

export function openStore(repoPath: string): DatabaseSync {
  const dir = path.join(repoPath, DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, DB_FILE);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  initTables(db);
  return db;
}

export function closeStore(db: DatabaseSync): void {
  db.close();
}

export function deleteStore(repoPath: string): void {
  const dbPath = path.join(repoPath, DB_DIR, DB_FILE);
  for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function initTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS triggers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT,
      precondition TEXT,
      source TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS flow_trees (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL,
      root TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (trigger_id) REFERENCES triggers(id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      function_spec TEXT NOT NULL DEFAULT '{}',
      boundary TEXT NOT NULL DEFAULT '{}',
      data_operations TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      FOREIGN KEY (parent_id) REFERENCES blocks(id)
    );

    CREATE TABLE IF NOT EXISTS ports (
      id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL,
      contract TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT 'external',
      FOREIGN KEY (block_id) REFERENCES blocks(id)
    );

    CREATE TABLE IF NOT EXISTS deps (
      id TEXT PRIMARY KEY,
      source_block_id TEXT NOT NULL,
      target_block_id TEXT NOT NULL,
      via_port TEXT,
      protocol TEXT NOT NULL DEFAULT 'unknown',
      source TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (source_block_id) REFERENCES blocks(id),
      FOREIGN KEY (target_block_id) REFERENCES blocks(id)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      git_sha TEXT NOT NULL,
      created_at TEXT NOT NULL,
      version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      access_mode TEXT NOT NULL,
      entities TEXT NOT NULL DEFAULT '[]',
      operations TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS trigger_traces (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL,
      target_block_id TEXT NOT NULL,
      effect TEXT NOT NULL DEFAULT '',
      data_source_effects TEXT NOT NULL DEFAULT '[]',
      branch TEXT NOT NULL DEFAULT 'normal',
      parent_trace_id TEXT,
      FOREIGN KEY (trigger_id) REFERENCES triggers(id),
      FOREIGN KEY (target_block_id) REFERENCES blocks(id)
    );
  `);

  // Migration: older DBs may lack the `data_operations` column on blocks.
  migrateColumns(db, "blocks", [{ name: "data_operations", ddl: "TEXT NOT NULL DEFAULT '[]'" }]);
  migrateColumns(db, "ports", [{ name: "scope", ddl: "TEXT NOT NULL DEFAULT 'external'" }]);
}

function tableColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name);
}

function migrateColumns(db: DatabaseSync, table: string, cols: Array<{ name: string; ddl: string }>): void {
  const existing = new Set(tableColumns(db, table));
  for (const c of cols) {
    if (!existing.has(c.name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${c.name} ${c.ddl}`);
  }
}
