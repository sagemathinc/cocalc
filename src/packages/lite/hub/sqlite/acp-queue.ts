import type { AcpChatContext, AcpStreamMessage } from "@cocalc/conat/ai/acp/types";
import { getDatabase } from "./database";

const TABLE = "acp_queue";

function init(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      message_date TEXT NOT NULL,
      seq INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, path, message_date, seq)
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS acp_queue_created_idx ON ${TABLE}(created_at)`,
  );
}

let initialized = false;

function ensureInit(): void {
  if (!initialized) {
    init();
    initialized = true;
  }
}

export function enqueueAcpPayload(
  context: AcpChatContext,
  payload: AcpStreamMessage,
): void {
  ensureInit();
  const db = getDatabase();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${TABLE}
      (project_id, path, message_date, seq, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(
    context.project_id,
    context.path,
    context.message_date,
    payload.seq ?? 0,
    JSON.stringify(payload),
    Date.now(),
  );
  pruneExpired();
}

export function listAcpPayloads(
  context: AcpChatContext,
): AcpStreamMessage[] {
  ensureInit();
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT payload FROM ${TABLE}
     WHERE project_id = ? AND path = ? AND message_date = ?
     ORDER BY seq ASC`,
  );
  return stmt
    .all(context.project_id, context.path, context.message_date)
    .map((row: { payload: string }) => JSON.parse(row.payload));
}

export function clearAcpPayloads(context: AcpChatContext): void {
  ensureInit();
  const db = getDatabase();
  const stmt = db.prepare(
    `DELETE FROM ${TABLE}
     WHERE project_id = ? AND path = ? AND message_date = ?`,
  );
  stmt.run(context.project_id, context.path, context.message_date);
}

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

export function pruneExpired(retentionMs: number = DEFAULT_RETENTION_MS): void {
  ensureInit();
  const cutoff = Date.now() - retentionMs;
  const db = getDatabase();
  db.prepare(`DELETE FROM ${TABLE} WHERE created_at < ?`).run(cutoff);
}
