// Manage Codex session JSONL files on disk (update metadata + fork sessions).
// We do this directly because the CLI does not expose a way to update
// session_meta for resumed sessions (e.g. cwd/sandbox), and codex exec
// cannot override those settings once a session exists. If upstream
// adds a supported API, we can delete this and call that instead.

import fs from "node:fs/promises";
import path from "node:path";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("ai:acp:codex-session-store");

type SessionMetaLine = {
  type: "session_meta";
  payload: Record<string, unknown>;
};

function defaultCodexHome(): string | undefined {
  if (process.env.COCALC_CODEX_HOME) return process.env.COCALC_CODEX_HOME;
  if (process.env.COCALC_ORIGINAL_HOME) {
    return path.join(process.env.COCALC_ORIGINAL_HOME, ".codex");
  }
  if (process.env.HOME) return path.join(process.env.HOME, ".codex");
  return undefined;
}

export function getSessionsRoot(): string | undefined {
  const home = defaultCodexHome();
  return home ? path.join(home, "sessions") : undefined;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export async function findSessionFile(
  sessionId: string,
  sessionsRoot: string,
): Promise<string | undefined> {
  const files = await walk(sessionsRoot);
  const suffix = `-${sessionId}.jsonl`;
  return files.find((file) => file.endsWith(suffix));
}

export async function readSessionMeta(
  filePath: string,
): Promise<SessionMetaLine> {
  const data = await fs.readFile(filePath, "utf8");
  const firstLine = data.split(/\r?\n/, 1)[0];
  const parsed = JSON.parse(firstLine) as SessionMetaLine;
  if (!parsed || parsed.type !== "session_meta") {
    throw new Error(`invalid session meta in ${filePath}`);
  }
  return parsed;
}

export async function rewriteSessionMeta(
  filePath: string,
  updater: (payload: Record<string, unknown>) => Record<string, unknown>,
): Promise<boolean> {
  const data = await fs.readFile(filePath, "utf8");
  const lines = data.split(/\r?\n/);
  if (lines.length === 0) return false;
  const first = lines[0];
  const parsed = JSON.parse(first) as SessionMetaLine;
  if (!parsed || parsed.type !== "session_meta") {
    throw new Error(`invalid session meta in ${filePath}`);
  }
  const nextPayload = updater(parsed.payload);
  if (JSON.stringify(nextPayload) === JSON.stringify(parsed.payload)) {
    return false;
  }
  const nextLine = JSON.stringify({
    type: "session_meta",
    payload: nextPayload,
    timestamp: parsed["timestamp"] ?? new Date().toISOString(),
  });
  lines[0] = nextLine;
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);
  await fs.writeFile(tmp, lines.join("\n"), "utf8");
  await fs.rename(tmp, filePath);
  return true;
}

function formatRolloutFilename(ts: Date, sessionId: string): string {
  const iso = ts.toISOString().replace(/:/g, "-");
  return `rollout-${iso}-${sessionId}.jsonl`;
}

export async function forkSession(
  sessionId: string,
  newSessionId: string,
  sessionsRoot: string,
): Promise<string> {
  const source = await findSessionFile(sessionId, sessionsRoot);
  if (!source) {
    throw new Error(`session file not found for ${sessionId}`);
  }
  const data = await fs.readFile(source, "utf8");
  const lines = data.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error(`empty session file ${source}`);
  }
  const parsed = JSON.parse(lines[0]) as SessionMetaLine;
  if (!parsed || parsed.type !== "session_meta") {
    throw new Error(`invalid session meta in ${source}`);
  }
  const now = new Date();
  const payload = {
    ...parsed.payload,
    id: newSessionId,
    timestamp: now.toISOString(),
    forked_from: sessionId,
  };
  lines[0] = JSON.stringify({
    type: "session_meta",
    payload,
    timestamp: now.toISOString(),
  });
  const dir = path.dirname(source);
  const target = path.join(dir, formatRolloutFilename(now, newSessionId));
  await fs.writeFile(target, lines.join("\n"), "utf8");
  logger.debug("forked session", { source, target });
  return target;
}
