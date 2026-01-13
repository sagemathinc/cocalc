/*
Minimal control-agent tool handlers for CoCalc+Plus (lite hub).
*/

import { promises as fs } from "node:fs";
import { join } from "node:path";

import type {
  ControlAgentToolAdapter,
  ControlAgentToolContext,
  ControlAgentToolHandler,
} from "@cocalc/ai/control-agent";
import type {
  ConfigGetRequest,
  ConfigGetResponse,
  ConfigSetRequest,
  ConfigSetResponse,
  ControlAgentToolResult,
  ControlAgentToolSuccess,
  EditorInfo,
  EditorsListRequest,
  EditorsListResponse,
  LogEntry,
  LogsSearchRequest,
  LogsSearchResponse,
  SyncConfigureRequest,
  SyncConfigureResponse,
} from "@cocalc/ai/control-agent/tools";
import { logs } from "@cocalc/backend/data";
import getLogger from "@cocalc/backend/logger";
import { EXTRAS as SITE_SETTINGS_EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { keys } from "@cocalc/util/misc";
import { site_settings_conf as SITE_SETTINGS_CONF } from "@cocalc/util/schema";
import { getCustomizePayload } from "../settings";
import { upsertRow } from "../sqlite/database";

const logger = getLogger("lite:hub:control-agent:tools");

const LOG_FILE = join(logs, "log");
const MAX_LOG_BYTES = 1024 * 1024;
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
const DEFAULT_LOG_LIMIT = 200;

type ToolResult<T> = ControlAgentToolResult<T>;

const EDITORS: EditorInfo[] = [
  { id: "code", name: "Code Editor" },
  { id: "terminal", name: "Terminal" },
  { id: "jupyter", name: "Jupyter Notebook" },
  { id: "markdown", name: "Markdown" },
  { id: "latex", name: "LaTeX" },
  { id: "chat", name: "Chat" },
];

const ALLOWED_SETTINGS = new Set(
  keys(SITE_SETTINGS_CONF).concat(keys(SITE_SETTINGS_EXTRAS)),
);

function ok<T>(
  requestId: string,
  data: T,
  dryRun?: boolean,
): ControlAgentToolSuccess<T> {
  return {
    status: "ok",
    requestId,
    data,
    ...(dryRun ? { dryRun: true } : {}),
  };
}

function errorResult(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ControlAgentToolResult<never> {
  return {
    status: "error",
    requestId,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

function resolveDryRun(
  context: ControlAgentToolContext,
  input: { dryRun?: boolean },
): boolean {
  return input.dryRun ?? context.dryRun ?? false;
}

async function readLogTail(): Promise<string[]> {
  try {
    const stat = await fs.stat(LOG_FILE);
    const start = Math.max(0, stat.size - MAX_LOG_BYTES);
    const handle = await fs.open(LOG_FILE, "r");
    try {
      const size = stat.size - start;
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, start);
      return buffer.toString("utf8").split("\n").filter(Boolean);
    } finally {
      await handle.close();
    }
  } catch (err) {
    logger.debug("log search failed", err);
    return [];
  }
}

function parseLogLine(line: string): LogEntry {
  const cleaned = line.replace(ANSI_REGEX, "");
  const match = cleaned.match(
    /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\s+\([^)]*\):\s*(.*)$/,
  );
  const timestamp = match?.[1] ?? "";
  const message = match?.[2] ?? cleaned;
  let level = "info";
  const levelMatch = message.match(
    /cocalc:(error|warn|info|http|verbose|debug|silly)/,
  );
  if (levelMatch?.[1]) {
    level = levelMatch[1];
  }
  const sourceMatch = message.match(/(cocalc:[^ ]+)/);
  return {
    timestamp,
    level,
    message,
    source: sourceMatch?.[1],
  };
}

async function handleLogsSearch(
  input: LogsSearchRequest,
): Promise<ToolResult<LogsSearchResponse>> {
  const lines = await readLogTail();
  const query = input.query?.toLowerCase();
  const filtered = query
    ? lines.filter((line) => line.toLowerCase().includes(query))
    : lines;
  const limit = input.limit ?? DEFAULT_LOG_LIMIT;
  const selected = filtered.slice(Math.max(0, filtered.length - limit));
  return ok(input.requestId, {
    entries: selected.map(parseLogLine),
  });
}

async function handleConfigGet(
  input: ConfigGetRequest,
): Promise<ToolResult<ConfigGetResponse>> {
  const payload = await getCustomizePayload();
  const values = payload.configuration ?? {};
  if (!input.keys?.length) {
    return ok(input.requestId, { values });
  }
  const result: Record<string, unknown> = {};
  for (const key of input.keys) {
    if (key in values) {
      result[key] = values[key];
    }
  }
  return ok(input.requestId, { values: result });
}

async function handleConfigSet(
  input: ConfigSetRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<ConfigSetResponse>> {
  const dryRun = resolveDryRun(context, input);
  const invalidKeys = Object.keys(input.values).filter(
    (key) => !ALLOWED_SETTINGS.has(key),
  );
  if (invalidKeys.length) {
    return errorResult(
      input.requestId,
      "invalid_config_keys",
      "One or more configuration keys are not allowed.",
      { keys: invalidKeys },
    );
  }
  if (!dryRun) {
    for (const [key, value] of Object.entries(input.values)) {
      upsertRow("server_settings", key, { name: key, value });
    }
  }
  const payload = await getCustomizePayload();
  const values = payload.configuration ?? {};
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input.values)) {
    result[key] = values[key];
  }
  return ok(input.requestId, { values: result }, dryRun);
}

async function handleEditorsList(
  input: EditorsListRequest,
): Promise<ToolResult<EditorsListResponse>> {
  return ok(input.requestId, { editors: EDITORS });
}

async function handleSyncConfigure(
  input: SyncConfigureRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<SyncConfigureResponse>> {
  const dryRun = resolveDryRun(context, input);
  if (!dryRun) {
    upsertRow("remote_sync", "default", input.config);
  }
  return ok(input.requestId, { config: input.config }, dryRun);
}

export function createLiteControlAgentToolAdapter(): ControlAgentToolAdapter {
  const handlers: Record<string, ControlAgentToolHandler> = {
    "logs.search": handleLogsSearch,
    "config.get": handleConfigGet,
    "config.set": handleConfigSet,
    "editors.list": handleEditorsList,
    "sync.configure": handleSyncConfigure,
  };
  return {
    toString: () => "LiteControlAgentToolAdapter",
    getToolHandlers: () => handlers,
  };
}

export type { ControlAgentToolHandler };
