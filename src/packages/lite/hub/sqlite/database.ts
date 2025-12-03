import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

type Statement = {
  run: (...args: any[]) => any;
  all: (...args: any[]) => any[];
  get: (...args: any[]) => any;
};

export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

let db: SqliteDatabase | undefined;

export interface DatabaseOptions {
  filename?: string;
}

const DEFAULT_FILENAME = path.join(
  process.cwd(),
  "data",
  "lite",
  "hub",
  "sqlite.db",
);

function ensureDirectory(file: string): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
}

export function initDatabase(options: DatabaseOptions = {}): SqliteDatabase {
  if (db != null) {
    return db;
  }
  const envFilename = process.env.COCALC_LITE_SQLITE_FILENAME;
  const filename = options.filename ?? envFilename ?? DEFAULT_FILENAME;
  if (filename !== ":memory:") {
    ensureDirectory(filename);
  }
  db = new DatabaseSync(filename) as unknown as SqliteDatabase;
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS data (
      table_name TEXT NOT NULL,
      pk TEXT NOT NULL,
      row TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (table_name, pk)
    )`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS data_table_updated_idx ON data(table_name, updated_at)",
  );
  return db;
}

export function getDatabase(): SqliteDatabase {
  if (db == null) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (db != null) {
    db.close();
    db = undefined;
  }
}

export function clearTable(table: string): void {
  const database = getDatabase();
  database.prepare("DELETE FROM data WHERE table_name = ?").run(table);
}

export function listRows(table: string): any[] {
  const database = getDatabase();
  const stmt = database.prepare("SELECT row FROM data WHERE table_name = ?");
  return stmt
    .all(table)
    .map((x: { row: string }) => JSON.parse(x.row));
}

export function getRow(table: string, pk: string): any | undefined {
  const database = getDatabase();
  const stmt = database.prepare(
    "SELECT row FROM data WHERE table_name = ? AND pk = ?",
  );
  const result = stmt.get(table, pk) as { row: string } | undefined;
  return result ? JSON.parse(result.row) : undefined;
}

export function upsertRow(
  table: string,
  pk: string,
  row: Record<string, unknown>,
): void {
  const database = getDatabase();
  const stmt = database.prepare(
    "INSERT INTO data(table_name, pk, row, updated_at) VALUES(?, ?, ?, ?) " +
      "ON CONFLICT(table_name, pk) DO UPDATE SET row=excluded.row, updated_at=excluded.updated_at",
  );
  stmt.run(table, pk, JSON.stringify(row), Date.now());
}

export function deleteRow(table: string, pk: string): void {
  const database = getDatabase();
  database.prepare("DELETE FROM data WHERE table_name = ? AND pk = ?").run(table, pk);
}
