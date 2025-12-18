import sha1 from "sha1";

/**
 * Canonical identifiers for persisting and streaming ACP/Codex activity logs.
 *
 * These identifiers must be derived deterministically from:
 *   - `project_id` + `path` (chat file)           → AKV store name
 *   - `thread_root_date` (root message ISO date)  → per-thread namespace
 *   - `turn_date` (assistant reply ISO date)      → per-turn namespace
 *
 * Both frontend and backend should use this helper so we never have to
 * "invent" subjects/keys in multiple places (which is fragile and can lead to
 * races and mis-associated logs).
 *
 * Notes:
 * - `thread_root_date` and `turn_date` are expected to be ISO timestamps
 *   (e.g. `new Date().toISOString()`), matching how chat messages store `date`.
 * - The pub/sub subject is project-scoped so authorization naturally follows
 *   project membership via conat/NATS subjects.
 */

export type AcpLogRefs = Readonly<{
  store: string;
  thread: string;
  turn: string;
  key: string;
  subject: string;
}>;

export function deriveAcpLogStoreName(project_id: string, path: string): string {
  // Historically we used sha1(project_id, path) via client_db.sha1, which for
  // string inputs is equivalent to sha1(project_id + path).
  return `acp-log:${sha1(`${project_id}${path}`)}`;
}

export function deriveAcpLogRefs(opts: {
  project_id: string;
  path: string;
  thread_root_date: string;
  turn_date: string;
}): AcpLogRefs {
  const { project_id, path, thread_root_date, turn_date } = opts;
  const store = deriveAcpLogStoreName(project_id, path);
  const thread = thread_root_date;
  const turn = turn_date;
  const key = `${thread}:${turn}`;
  const subject = `project.${project_id}.acp-log.${thread}.${turn}`;
  return { store, thread, turn, key, subject };
}
