import path from "node:path";
import { URL } from "node:url";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import getLogger from "@cocalc/backend/logger";
import {
  CodexAcpAgent,
  EchoAgent,
  type AcpAgent,
  type ApprovalDecision,
} from "@cocalc/ai/acp";
import { init as initConatAcp } from "@cocalc/conat/ai/acp/server";
import type {
  AcpRequest,
  AcpStreamPayload,
  AcpStreamMessage,
  AcpStreamEvent,
  AcpChatContext,
} from "@cocalc/conat/ai/acp/types";
import {
  resolveCodexSessionMode,
  type CodexSessionConfig,
} from "@cocalc/util/ai/codex";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { getBlobstore } from "./blobs/download";
import { type AKV } from "@cocalc/conat/sync/akv";
import { buildChatMessage, type MessageHistory } from "@cocalc/chat";
import { createChatSyncDB } from "@cocalc/chat/server";
import { appendStreamMessage, extractEventText } from "@cocalc/chat";
import type { SyncDB } from "@cocalc/conat/sync-doc/syncdb";
import type { AcpStreamUsage } from "@cocalc/ai/acp";
import { once } from "@cocalc/util/async-utils";
import {
  enqueueAcpPayload,
  listAcpPayloads,
  clearAcpPayloads,
} from "./sqlite/acp-queue";
import { throttle } from "lodash";

// how many ms between saving output during a running turn
// so that everybody sees it.
const COMMIT_INTERVAL = 2_000;

const logger = getLogger("lite:hub:acp");

let blobStore: AKV | null = null;
const agents = new Map<string, AcpAgent>();
let conatClient: ConatClient | null = null;

type ApprovalEvent = Extract<AcpStreamEvent, { type: "approval" }>;

class ChatStreamWriter {
  private syncdb: SyncDB;
  private metadata: AcpChatContext;
  private prevHistory: MessageHistory[] = [];
  private ready: Promise<void>;
  private closed = false;
  private events: AcpStreamMessage[] = [];
  private usage: AcpStreamUsage | null = null;
  private content = "";
  private threadId: string | null = null;
  private seq = 0;
  private finished = false;
  private onApprovalDecision?: (decision: ApprovalDecision) => void;

  constructor({
    metadata,
    client,
    onApprovalDecision,
  }: {
    metadata: AcpChatContext;
    client: ConatClient;
    onApprovalDecision?: (decision: ApprovalDecision) => void;
  }) {
    this.metadata = metadata;
    this.syncdb = createChatSyncDB({
      client,
      project_id: metadata.project_id,
      path: metadata.path,
    });
    this.onApprovalDecision = onApprovalDecision;
    this.syncdb.on("change", this.handleSyncChange);
    // ensure initialization rejections are observed immediately
    this.ready = this.initialize();
    this.waitUntilReady();
  }

  private waitUntilReady = async () => {
    try {
      await this.ready;
    } catch (err) {
      logger.warn("chat stream writer failed to initialize", err);
      this.closed = true;
      throw err;
    }
  };

  private async initialize(): Promise<void> {
    if (!this.syncdb.isReady()) {
      try {
        await once(this.syncdb, "ready");
      } catch (err) {
        logger.warn("chat syncdb failed to become ready", err);
        throw err;
      }
    }
    const current = this.syncdb.get_one({
      event: "chat",
      date: this.metadata.message_date,
    });
    if (current == null) return;
    const history = current.get("history");
    const arr = this.historyToArray(history);
    if (arr.length > 0) {
      this.prevHistory = arr.slice(1);
    }
    const queued = listAcpPayloads(this.metadata);
    for (const payload of queued) {
      this.processPayload(payload, { persist: false });
    }
  }

  private historyToArray(value: any): MessageHistory[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value.toJS === "function") {
      return value.toJS();
    }
    return [];
  }

  async handle(payload?: AcpStreamPayload | null): Promise<void> {
    await this.ready;
    if (this.closed) return;
    if (payload == null) {
      this.dispose();
      return;
    }
    const message: AcpStreamMessage = {
      ...(payload as AcpStreamMessage),
      seq: this.seq++,
    };
    this.processPayload(message, { persist: true });
    this.commit(true);
  }

  private processPayload(
    payload: AcpStreamMessage,
    { persist }: { persist: boolean },
  ): void {
    if (this.closed) return;
    if ((payload.seq ?? -1) >= this.seq) {
      this.seq = (payload.seq ?? -1) + 1;
    }
    if (persist) {
      try {
        enqueueAcpPayload(this.metadata, payload);
      } catch (err) {
        logger.warn("failed to enqueue acp payload", err);
      }
    }
    this.events = appendStreamMessage(this.events, payload);
    if (payload.type === "event") {
      const text = extractEventText(payload.event);
      if (text) {
        this.content = text;
      }
      return;
    }
    if (payload.type === "summary") {
      if (payload.finalResponse) {
        this.content = payload.finalResponse;
      }
      if (payload.usage) {
        this.usage = payload.usage;
      }
      if (payload.threadId != null) {
        this.threadId = payload.threadId;
      }
      clearAcpPayloads(this.metadata);
      this.finished = true;
      return;
    }
    if (payload.type === "error") {
      this.content = `\n\n<span style='color:#b71c1c'>${payload.error}</span>\n\n`;
      clearAcpPayloads(this.metadata);
      this.finished = true;
    }
  }

  private commit = throttle((generating: boolean): void => {
    if (this.closed) return;
    if (this.content && this.events.length) {
      const message = buildChatMessage({
        sender_id: this.metadata.sender_id,
        date: this.metadata.message_date,
        prevHistory: this.prevHistory,
        content: this.content,
        generating,
        reply_to: this.metadata.reply_to,
        acp_events: this.events,
        acp_thread_id: this.threadId,
        acp_usage: this.usage,
      });
      this.syncdb.set(message);
      this.syncdb.commit();
    }
    (async () => {
      try {
        await this.syncdb.save();
      } catch (err) {
        logger.warn("chat syncdb save failed", err);
      }
    })();
  }, COMMIT_INTERVAL);

  dispose(): void {
    if (this.closed) return;
    this.commit(false);
    this.commit.flush();
    this.closed = true;
    (this.syncdb as any).off?.("change", this.handleSyncChange);
    if (typeof this.syncdb.removeListener === "function") {
      this.syncdb.removeListener("change", this.handleSyncChange);
    }
    if (!this.finished) {
      clearAcpPayloads(this.metadata);
    }
    (async () => {
      try {
        await this.syncdb.save();
      } catch (err) {
        logger.warn("failed to save chat syncdb", err);
      }
      try {
        await this.syncdb.close();
      } catch (err) {
        logger.warn("failed to close chat syncdb", err);
      }
    })();
  }

  private handleSyncChange = (): void => {
    if (this.closed || !this.onApprovalDecision) return;
    const entry = this.syncdb.get_one({
      event: "chat",
      date: this.metadata.message_date,
    });
    if (!entry) return;
    const next = this.toJS(entry.get("acp_events"));
    if (!Array.isArray(next)) return;
    const nextEvents = next as AcpStreamMessage[];
    this.detectApprovalDecisions(this.events, nextEvents);
    this.events = nextEvents;
  };

  private detectApprovalDecisions(
    prev: AcpStreamMessage[],
    next: AcpStreamMessage[],
  ): void {
    if (!this.onApprovalDecision) return;
    const previous = this.mapApprovalStates(prev);
    const latest = this.mapApprovalStates(next);
    for (const [approvalId, state] of Object.entries(latest)) {
      if (state == null || state.status === "pending") continue;
      const before = previous[approvalId];
      const changed =
        !before ||
        before.status !== state.status ||
        before.selectedOptionId !== state.selectedOptionId;
      if (!changed) continue;
      this.onApprovalDecision({
        approvalId,
        optionId: state.selectedOptionId ?? undefined,
        decidedBy: state.decidedBy ?? undefined,
        note: state.note ?? undefined,
        status: state.status,
      });
    }
  }

  private mapApprovalStates(
    events: AcpStreamMessage[],
  ): Record<string, ApprovalEvent> {
    const result: Record<string, ApprovalEvent> = {};
    for (const entry of events) {
      if (entry?.type !== "event") continue;
      const event = entry.event;
      if (event?.type !== "approval") continue;
      result[event.approvalId] = event;
    }
    return result;
  }

  private toJS(value: any): any {
    if (value == null) return value;
    if (typeof value.toJS === "function") {
      return value.toJS();
    }
    return value;
  }
}

async function ensureAgent(useNativeTerminal: boolean): Promise<AcpAgent> {
  const key = useNativeTerminal ? "native" : "proxy";
  const existing = agents.get(key);
  if (existing != null) return existing;
  const mode = process.env.COCALC_ACP_MODE;
  logger.debug("ensureAgent", { mode, useNativeTerminal });
  const sessionsDir =
    process.env.COCALC_ACP_SESSIONS_DIR ??
    path.join(process.cwd(), "data/codex-sessions");
  if (mode === "echo") {
    logger.debug("ensureAgent: creating echo agent");
    const echo = new EchoAgent();
    agents.set(key, echo);
    return echo;
  }
  try {
    logger.debug("ensureAgent: creating codex acp agent");
    const created = await CodexAcpAgent.create({
      binaryPath: process.env.COCALC_ACP_AGENT_BIN,
      cwd: process.cwd(),
      sessionPersistPath: sessionsDir,
      useNativeTerminal,
    });
    logger.info("codex-acp agent ready", { key });
    agents.set(key, created);
  } catch (err) {
    logger.error("failed to start codex-acp, falling back to echo agent", err);
    const fallback = new EchoAgent();
    agents.set(key, fallback);
  }
  return agents.get(key)!;
}

export async function evaluate({
  stream,
  ...request
}: AcpRequest & {
  stream: (payload?: AcpStreamPayload | null) => Promise<void>;
}): Promise<void> {
  const config = normalizeConfig(request.config);
  const sessionMode = resolveCodexSessionMode(config);
  const useNativeTerminal = sessionMode === "auto";
  const currentAgent = await ensureAgent(useNativeTerminal);
  const { prompt, cleanup } = await materializeBlobs(request.prompt ?? "");
  if (!conatClient) {
    throw Error("conat client must be initialized");
  }
  const approvalCallback =
    currentAgent instanceof CodexAcpAgent
      ? (decision: ApprovalDecision) => {
          const handled = currentAgent.resolveApproval(decision);
          if (!handled) {
            logger.warn("no pending approval matched", decision);
          }
        }
      : undefined;
  const chatWriter = request.chat
    ? new ChatStreamWriter({
        metadata: request.chat,
        client: conatClient,
        onApprovalDecision: approvalCallback,
      })
    : null;

  let wrappedStream;
  if (chatWriter != null) {
    wrappedStream = async (payload?: AcpStreamPayload | null) => {
      try {
        await chatWriter.handle(payload);
      } catch (err) {
        logger.warn("chat writer handle failed", err);
      }
      if (payload == null) {
        stream(null);
      }
    };
  } else {
    wrappedStream = stream;
  }

  try {
    await currentAgent.evaluate({
      ...request,
      prompt,
      config,
      stream: wrappedStream,
    });
  } finally {
    // TODO: we might not want to immediately close, since there is
    // overhead in creating the syncdoc each time.
    chatWriter?.dispose();
    await cleanup();
  }
}

export async function init(client: ConatClient): Promise<void> {
  logger.debug("initializing ACP conat server");
  conatClient = client;
  process.once("exit", () => {
    for (const agent of agents.values()) {
      agent
        .dispose?.()
        .catch((err) => {
          logger.warn("failed to dispose ACP agent", err);
        })
        .finally(() => undefined);
    }
  });
  blobStore = getBlobstore(client);
  await initConatAcp(evaluate, client);
}

function normalizeConfig(
  config?: CodexSessionConfig,
): CodexSessionConfig | undefined {
  if (config == null) return;
  const normalized: CodexSessionConfig = { ...config };
  if (config.workingDirectory) {
    normalized.workingDirectory = path.resolve(config.workingDirectory);
  }
  return normalized;
}

type BlobReference = {
  url: string;
  uuid: string;
  filename?: string;
};

async function materializeBlobs(
  prompt: string,
): Promise<{ prompt: string; cleanup: () => Promise<void> }> {
  if (!blobStore) {
    return { prompt, cleanup: async () => {} };
  }
  const refs = extractBlobReferences(prompt);
  if (!refs.length) {
    return { prompt, cleanup: async () => {} };
  }
  const unique = dedupeRefs(refs);
  if (!unique.length) {
    return { prompt, cleanup: async () => {} };
  }
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `cocalc-blobs-${randomUUID()}-`),
  );
  const attachments: { url: string; path: string }[] = [];
  try {
    for (const ref of unique) {
      try {
        const data = await blobStore!.get(ref.uuid);
        if (data == null) continue;
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const safeName = buildSafeFilename(ref);
        const filePath = path.join(tempDir, safeName);
        await fs.writeFile(filePath, buffer);
        attachments.push({ url: ref.url, path: filePath });
      } catch (err) {
        logger.warn("failed to materialize blob", { ref, err });
      }
    }
    if (!attachments.length) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return { prompt, cleanup: async () => {} };
    }
    const info = attachments
      .map(
        (att, idx) =>
          `Attachment ${idx + 1}: saved at ${att.path} (source ${att.url})`,
      )
      .join("\n");
    const augmented = `${prompt}\n\nAttachments saved locally:\n${info}\n`;
    return {
      prompt: augmented,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    logger.warn("failed to prepare attachments", err);
    await fs.rm(tempDir, { recursive: true, force: true });
    return { prompt, cleanup: async () => {} };
  }
}

function dedupeRefs(refs: BlobReference[]): BlobReference[] {
  const seen = new Set<string>();
  const result: BlobReference[] = [];
  for (const ref of refs) {
    if (seen.has(ref.uuid)) continue;
    seen.add(ref.uuid);
    result.push(ref);
  }
  return result;
}

function buildSafeFilename(ref: BlobReference): string {
  const baseName = sanitizeFilename(ref.filename || ref.uuid);
  const extension = path.extname(baseName);
  const finalName =
    extension.length > 0 ? baseName : `${baseName || ref.uuid}.bin`;
  return `${ref.uuid}-${finalName}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function extractBlobReferences(prompt: string): BlobReference[] {
  const urls = new Set<string>();
  const markdown = /!\[[^\]]*\]\(([^)]+\/blobs\/[^)]+)\)/gi;
  const html = /<img[^>]+src=["']([^"']+\/blobs\/[^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = markdown.exec(prompt)) != null) {
    urls.add(match[1]);
  }
  while ((match = html.exec(prompt)) != null) {
    urls.add(match[1]);
  }
  const refs: BlobReference[] = [];
  for (const url of urls) {
    const parsed = parseBlobReference(url);
    if (parsed?.uuid) {
      refs.push(parsed);
    }
  }
  return refs;
}

function parseBlobReference(target: string): BlobReference | undefined {
  const trimmed = target.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(
      trimmed,
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? undefined
        : "http://placeholder",
    );
    if (!url.pathname.includes("/blobs/")) {
      return undefined;
    }
    const uuid = url.searchParams.get("uuid");
    if (!uuid) return undefined;
    const filename = path.basename(url.pathname);
    return {
      url: trimmed,
      uuid,
      filename,
    };
  } catch {
    return undefined;
  }
}
