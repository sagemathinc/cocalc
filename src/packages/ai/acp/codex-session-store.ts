// Manage Codex session JSONL files on disk (update metadata + fork sessions).
// We do this directly because the CLI does not expose a way to update
// session_meta for resumed sessions (e.g. cwd/sandbox), and codex exec
// cannot override those settings once a session exists. If upstream
// adds a supported API, we can delete this and call that instead.

import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("ai:acp:codex-session-store");
const DEFAULT_TRUNCATE_BYTES = 100 * 1024 * 1024;
const DEFAULT_KEEP_COMPACTIONS = 2;

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
  const firstLine = await readFirstLine(filePath);
  const parsed = JSON.parse(firstLine) as SessionMetaLine;
  if (!parsed || parsed.type !== "session_meta") {
    throw new Error(`invalid session meta in ${filePath}`);
  }
  return parsed;
}

async function readFirstLine(filePath: string): Promise<string> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  return await new Promise<string>((resolve, reject) => {
    let done = false;
    rl.on("line", (line) => {
      if (done) return;
      done = true;
      rl.close();
      stream.destroy();
      resolve(line);
    });
    rl.on("close", () => {
      if (!done) {
        reject(new Error(`empty session file ${filePath}`));
      }
    });
    rl.on("error", (err) => reject(err));
    stream.on("error", (err) => reject(err));
  });
}

export async function rewriteSessionMeta(
  filePath: string,
  updater: (payload: Record<string, unknown>) => Record<string, unknown>,
): Promise<boolean> {
  const firstLine = await readFirstLine(filePath);
  const parsed = JSON.parse(firstLine) as SessionMetaLine;
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
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(filePath, { encoding: "utf8" });
    const output = createWriteStream(tmp, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let wroteFirst = false;
    rl.on("line", (line) => {
      if (!wroteFirst) {
        output.write(`${nextLine}\n`);
        wroteFirst = true;
        return;
      }
      output.write(`${line}\n`);
    });
    rl.on("close", () => {
      output.end();
    });
    rl.on("error", (err) => {
      input.destroy();
      output.destroy();
      reject(err);
    });
    input.on("error", (err) => {
      output.destroy();
      reject(err);
    });
    output.on("error", (err) => {
      input.destroy();
      reject(err);
    });
    output.on("close", () => resolve());
  });
  await fs.rename(tmp, filePath);
  return true;
}

// Codex can accumulate huge JSONL session files (multi-GB) because it never
// trims prior compactions. We don't need that full history for CoCalc since the
// authoritative chat log lives in our frontend; we only need recent compaction
// state for context. This keeps session files bounded and prevents OOM/slow
// behavior when resuming old sessions, e.g., "codex resume" will easily use
// 5GB+ loading a massive jsonl history, just to ignore most of it.
// If codex will change to not store all these old pointless compaction
// in the jsonl history and then we can remove this.
export async function truncateSessionHistory(
  filePath: string,
  opts?: { maxBytes?: number; keepCompactions?: number },
): Promise<boolean> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_TRUNCATE_BYTES;
  const keepCompactions = opts?.keepCompactions ?? DEFAULT_KEEP_COMPACTIONS;
  if (keepCompactions <= 0) return false;
  const stats = await fs.stat(filePath);
  if (stats.size < maxBytes) return false;

  const compactionLines: number[] = [];
  let totalLines = 0;
  const input = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.includes('"type":"compacted"')) {
        compactionLines.push(totalLines);
        if (compactionLines.length > keepCompactions) {
          compactionLines.shift();
        }
      }
      totalLines += 1;
    }
  } finally {
    rl.close();
    input.destroy();
  }

  if (compactionLines.length === 0) return false;
  const startIndex = compactionLines[0];
  if (startIndex <= 1) return false;

  const firstLine = await readFirstLine(filePath);
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);

  await new Promise<void>((resolve, reject) => {
    const read = createReadStream(filePath, { encoding: "utf8" });
    const write = createWriteStream(tmp, { encoding: "utf8" });
    const rlCopy = readline.createInterface({ input: read, crlfDelay: Infinity });
    let lineNum = 0;
    let wroteHeader = false;

    rlCopy.on("line", (line) => {
      if (!wroteHeader) {
        write.write(`${firstLine}\n`);
        wroteHeader = true;
      }
      if (lineNum >= startIndex) {
        write.write(`${line}\n`);
      }
      lineNum += 1;
    });
    rlCopy.on("close", () => {
      write.end();
    });
    rlCopy.on("error", (err) => {
      read.destroy();
      write.destroy();
      reject(err);
    });
    read.on("error", (err) => {
      write.destroy();
      reject(err);
    });
    write.on("error", (err) => {
      read.destroy();
      reject(err);
    });
    write.on("close", () => resolve());
  });

  await fs.rename(tmp, filePath);
  logger.debug("truncated session history", {
    filePath,
    startIndex,
    totalLines,
    size: stats.size,
  });
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
  const firstLine = await readFirstLine(source);
  const parsed = JSON.parse(firstLine) as SessionMetaLine;
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
  const nextLine = JSON.stringify({
    type: "session_meta",
    payload,
    timestamp: now.toISOString(),
  });
  const dir = path.dirname(source);
  const target = path.join(dir, formatRolloutFilename(now, newSessionId));
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(source, { encoding: "utf8" });
    const output = createWriteStream(target, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let wroteFirst = false;
    rl.on("line", (line) => {
      if (!wroteFirst) {
        output.write(`${nextLine}\n`);
        wroteFirst = true;
        return;
      }
      output.write(`${line}\n`);
    });
    rl.on("close", () => {
      output.end();
    });
    rl.on("error", (err) => {
      input.destroy();
      output.destroy();
      reject(err);
    });
    input.on("error", (err) => {
      output.destroy();
      reject(err);
    });
    output.on("error", (err) => {
      input.destroy();
      reject(err);
    });
    output.on("close", () => resolve());
  });
  logger.debug("forked session", { source, target });
  return target;
}
