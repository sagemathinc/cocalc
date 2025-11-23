import path from "node:path";
import { URL } from "node:url";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import getLogger from "@cocalc/backend/logger";
import { CodexAcpAgent, EchoAgent, type AcpAgent } from "@cocalc/ai/acp";
import { init as initConatAcp } from "@cocalc/conat/ai/acp/server";
import type {
  AcpRequest,
  AcpStreamPayload,
  AcpStreamMessage,
  AcpChatContext,
} from "@cocalc/conat/ai/acp/types";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";
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

const logger = getLogger("lite:hub:acp");

let blobStore: AKV | null = null;
let agent: AcpAgent | null = null;
let conatClient: ConatClient | null = null;

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
  private hasSummary = false;
  private finished = false;

  constructor({
    metadata,
    client,
  }: {
    metadata: AcpChatContext;
    client: ConatClient;
  }) {
    this.metadata = metadata;
    this.syncdb = createChatSyncDB({
      client,
      project_id: metadata.project_id,
      path: metadata.path,
    });
    // ensure initialization rejections are observed immediately
    this.ready = this.initialize().catch((err) => {
      logger.warn("chat stream writer failed to initialize", err);
      this.closed = true;
      throw err;
    });
  }

  private async initialize(): Promise<void> {
    if (!this.syncdb.isReady()) {
      try {
        await once(this.syncdb, "ready");
        logger.debug(
          "ready to write to",
          this.metadata.path,
          this.metadata.project_id,
        );
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
      if (!this.hasSummary && this.content) {
        this.commit(false);
      }
      this.dispose();
      return;
    }
    const message: AcpStreamMessage = {
      ...(payload as AcpStreamMessage),
      seq: this.seq++,
    };
    this.processPayload(message, { persist: true });
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
      this.hasSummary = true;
      if (payload.finalResponse) {
        this.content = payload.finalResponse;
      }
      if (payload.usage) {
        this.usage = payload.usage;
      }
      if (payload.threadId != null) {
        this.threadId = payload.threadId;
      }
      this.commit(false);
      clearAcpPayloads(this.metadata);
      this.finished = true;
      return;
    }
    if (payload.type === "error") {
      this.content = `\n\n<span style='color:#b71c1c'>${payload.error}</span>\n\n`;
      this.commit(false);
      clearAcpPayloads(this.metadata);
      this.finished = true;
    }
  }

  private commit(generating: boolean): void {
    if (!this.content && !this.events.length) return;
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
    if (!generating) {
      this.syncdb.commit();
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.finished) {
      clearAcpPayloads(this.metadata);
    }
    try {
      this.syncdb.close();
    } catch (err) {
      logger.warn("failed to close chat syncdb", err);
    }
  }
}

async function ensureAgent(): Promise<AcpAgent> {
  if (agent != null) return agent;
  const mode = process.env.COCALC_ACP_MODE;
  logger.debug("ensureAgent", { mode });
  const sessionsDir =
    process.env.COCALC_ACP_SESSIONS_DIR ??
    path.join(process.cwd(), "data/codex-sessions");
  if (mode === "echo") {
    logger.debug("ensureAgent: creating echo agent");
    agent = new EchoAgent();
    return agent;
  }
  try {
    logger.debug("ensureAgent: creating codex acp agent");
    agent = await CodexAcpAgent.create({
      binaryPath: process.env.COCALC_ACP_AGENT_BIN,
      cwd: process.cwd(),
      sessionPersistPath: sessionsDir,
    });
    logger.info("codex-acp agent ready");
  } catch (err) {
    logger.error("failed to start codex-acp, falling back to echo agent", err);
    agent = new EchoAgent();
  }
  return agent!;
}

export async function evaluate({
  stream,
  ...request
}: AcpRequest & {
  stream: (payload?: AcpStreamPayload | null) => Promise<void>;
}): Promise<void> {
  const currentAgent = await ensureAgent();
  const config = normalizeConfig(request.config);
  const { prompt, cleanup } = await materializeBlobs(request.prompt ?? "");
  const chatWriter =
    request.chat && conatClient
      ? new ChatStreamWriter({
          metadata: request.chat,
          client: conatClient,
        })
      : null;
  logger.debug("evaluate", {
    conatClient: !!conatClient,
    request,
    chatWriter: !!chatWriter,
  });
  const wrappedStream = async (payload?: AcpStreamPayload | null) => {
    if (chatWriter != null) {
      try {
        await chatWriter.handle(payload);
      } catch (err) {
        logger.warn("chat writer handle failed", err);
      }
    }
    await stream(payload);
  };
  try {
    await currentAgent.evaluate({
      ...request,
      prompt,
      config,
      stream: wrappedStream,
    });
  } finally {
    chatWriter?.dispose();
    await cleanup();
  }
}

export async function init(client: ConatClient): Promise<void> {
  logger.debug("initializing acp conat server");
  conatClient = client;
  process.once("exit", () => {
    agent?.dispose?.().catch((err) => {
      logger.warn("failed to dispose ACP agent", err);
    });
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
