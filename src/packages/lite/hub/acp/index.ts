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
  AcpApprovalDecisionRequest,
  AcpInterruptRequest,
} from "@cocalc/conat/ai/acp/types";
import {
  resolveCodexSessionMode,
  type CodexSessionConfig,
} from "@cocalc/util/ai/codex";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { getBlobstore } from "../blobs/download";
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
} from "../sqlite/acp-queue";
import { throttle } from "lodash";
import { akv, type AKV } from "@cocalc/conat/sync/akv";
import { client_db } from "@cocalc/util/db-schema";

// how many ms between saving output during a running turn
// so that everybody sees it.
const COMMIT_INTERVAL = 2_000;

const logger = getLogger("lite:hub:acp");

let blobStore: AKV | null = null;
const agents = new Map<string, AcpAgent>();
let conatClient: ConatClient | null = null;

type ApprovalEvent = Extract<AcpStreamEvent, { type: "approval" }>;

const INTERRUPT_STATUS_TEXT =
  "Conversation interrupted - tell the model what to do differently.";

const chatWritersByChatKey = new Map<string, ChatStreamWriter>();
const chatWritersByThreadId = new Map<string, ChatStreamWriter>();

function chatKey(metadata: AcpChatContext): string {
  return `${metadata.project_id}:${metadata.path}:${metadata.message_date}`;
}

function findChatWriter({
  threadId,
  chat,
}: {
  threadId?: string;
  chat?: AcpChatContext;
}): ChatStreamWriter | undefined {
  if (threadId) {
    const writer = chatWritersByThreadId.get(threadId);
    if (writer != null) {
      return writer;
    }
  }
  if (chat != null) {
    return chatWritersByChatKey.get(chatKey(chat));
  }
  return undefined;
}

class ApprovalStore {
  private pending = new Map<
    string,
    {
      metadata: AcpChatContext;
      event: ApprovalEvent;
      approverAccountId: string;
    }
  >();

  record(
    metadata: AcpChatContext,
    event: ApprovalEvent,
    approverAccountId: string,
  ): void {
    if (event.status === "pending") {
      this.pending.set(event.approvalId, {
        metadata,
        event,
        approverAccountId,
      });
    } else {
      this.pending.delete(event.approvalId);
    }
  }

  get(approvalId: string):
    | {
        metadata: AcpChatContext;
        event: ApprovalEvent;
        approverAccountId: string;
      }
    | undefined {
    return this.pending.get(approvalId);
  }

  remove(approvalId: string): void {
    this.pending.delete(approvalId);
  }
}

const approvalStore = new ApprovalStore();
function resolveApproval(decision: ApprovalDecision): boolean {
  for (const agent of agents.values()) {
    if (agent instanceof CodexAcpAgent) {
      if (agent.resolveApproval(decision)) {
        return true;
      }
    }
  }
  return false;
}

class ChatStreamWriter {
  private syncdb: SyncDB;
  private metadata: AcpChatContext;
  private readonly chatKey: string;
  private threadKeys = new Set<string>();
  private prevHistory: MessageHistory[] = [];
  private ready: Promise<void>;
  private closed = false;
  private events: AcpStreamMessage[] = [];
  private usage: AcpStreamUsage | null = null;
  private content = "";
  private threadId: string | null = null;
  private seq = 0;
  private finished = false;
  private approverAccountId: string;
  private autoApprove?: (event: ApprovalEvent) => void;
  private interruptedMessage?: string;
  private interruptNotified = false;
  private disposeTimer?: NodeJS.Timeout;
  private sessionKey?: string;
  private logStore?: AKV<AcpStreamMessage[]>;
  private logStoreName: string;
  private logKey: string;
  private logThreadId: string;
  private logTurnId: string;
  private logSubject: string;
  private client: ConatClient;
  private persistLogProgress = throttle(
    async () => {
      try {
        const store = this.getLogStore();
        await store.set(this.logKey, this.events);
      } catch (err) {
        logger.debug("failed to persist acp log incrementally", err);
      }
    },
    1000,
    { leading: true, trailing: true },
  );

  constructor({
    metadata,
    client,
    approverAccountId,
    autoApprove,
    sessionKey,
  }: {
    metadata: AcpChatContext;
    client: ConatClient;
    approverAccountId: string;
    autoApprove?: (event: ApprovalEvent) => void;
    sessionKey?: string;
  }) {
    this.metadata = metadata;
    this.approverAccountId = approverAccountId;
    this.autoApprove = autoApprove;
    this.client = client;
    this.chatKey = chatKey(metadata);
    this.syncdb = createChatSyncDB({
      client,
      project_id: metadata.project_id,
      path: metadata.path,
    });
    chatWritersByChatKey.set(this.chatKey, this);
    this.sessionKey = sessionKey ?? undefined;
    if (sessionKey) {
      this.registerThreadKey(sessionKey);
    }
    this.logThreadId = metadata.reply_to ?? metadata.message_date;
    // Use the message timestamp as a unique turn identifier so each turn gets
    // an isolated log key; avoid reusing the session key which can span turns.
    this.logTurnId = metadata.message_date ?? randomUUID();
    const hash = client_db.sha1(metadata.project_id, metadata.path);
    this.logStoreName = `acp-log:${hash}`;
    this.logKey = `${this.logThreadId}:${this.logTurnId}`;
    this.logSubject = `project.${metadata.project_id}.acp-log.${this.logThreadId}.${this.logTurnId}`;
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
    const isLastMessage =
      message.type === "summary" || message.type === "error" || this.finished;
    this.commit(!isLastMessage);
    if (isLastMessage) {
      // Ensure the final "generating: false" state hits SyncDB immediately,
      // even if the throttle window is large.
      this.commit.flush();
    }
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
    if ((payload as any).type === "usage") {
      // Live usage updates from Codex; stash for commit and don't treat as a user-visible event.
      this.usage = (payload as any).usage ?? null;
      return;
    }
    this.events = appendStreamMessage(this.events, payload);
    this.publishLog(payload);
    this.persistLogProgress();
    if (payload.type === "event") {
      const text = extractEventText(payload.event);
      if (payload.event?.type === "approval") {
        approvalStore.record(
          this.metadata,
          payload.event,
          this.approverAccountId,
        );
        if (payload.event.status === "pending") {
          this.autoApprove?.(payload.event);
        }
      }
      if (text) {
        const last = this.events[this.events.length - 1];
        const mergedText =
          last?.type === "event" ? extractEventText(last.event) : undefined;
        // Use the merged text so we preserve the full streamed body.
        this.content = mergedText ?? text;
      }
      return;
    }
    if (payload.type === "summary") {
      const latestMessage = getLatestMessageText(this.events);
      const finalText =
        (latestMessage && latestMessage.trim().length > 0
          ? latestMessage
          : payload.finalResponse) ??
        this.interruptedMessage ??
        this.content;
      this.content = finalText;
      if (payload.usage) {
        this.usage = payload.usage;
      }
      if (payload.threadId != null) {
        this.threadId = payload.threadId;
        this.registerThreadKey(payload.threadId);
      }
      clearAcpPayloads(this.metadata);
      this.finished = true;
      void this.persistLog();
      return;
    }
    if (payload.type === "error") {
      this.content = `\n\n<span style='color:#b71c1c'>${payload.error}</span>\n\n`;
      clearAcpPayloads(this.metadata);
      this.finished = true;
      void this.persistLog();
    }
  }

  private commit = throttle((generating: boolean): void => {
    logger.debug("commit", {
      generating,
      closed: this.closed,
      content: this.content,
      events: this.events.length,
    });
    if (this.closed) return;
    const hasContent = !!this.content && this.events.length > 0;

    if (!hasContent) {
      // Even if there was no text payload, make sure we drop the spinner when finished.
      if (!generating) {
        try {
          const current = this.syncdb.get_one({
            event: "chat",
            date: this.metadata.message_date,
          });
          if (current != null && current.get("generating") !== false) {
            this.syncdb.set({
              date: this.metadata.message_date,
              generating: false,
            });
            this.syncdb.commit();
            (async () => {
              try {
                await this.syncdb.save();
              } catch (err) {
                logger.warn("chat syncdb save failed", err);
              }
            })();
          }
        } catch (err) {
          logger.warn("chat stream writer failed to clear generating", err);
        }
      }
      return;
    }

    const message = buildChatMessage({
      sender_id: this.metadata.sender_id,
      date: this.metadata.message_date,
      prevHistory: this.prevHistory,
      content: this.content,
      generating,
      reply_to: this.metadata.reply_to,
      acp_log_store: this.logStoreName,
      acp_log_key: this.logKey,
      acp_log_thread: this.logThreadId,
      acp_log_turn: this.logTurnId,
      acp_log_subject: this.logSubject,
      acp_thread_id: this.threadId,
      acp_usage: this.usage,
      acp_account_id: this.approverAccountId,
    } as any);
    this.syncdb.set(message);
    this.syncdb.commit();
    (async () => {
      try {
        await this.syncdb.save();
      } catch (err) {
        logger.warn("chat syncdb save failed", err);
      }
    })();
  }, COMMIT_INTERVAL);

  dispose(forceImmediate: boolean = false): void {
    if (this.closed) return;

    // If we've already finished the turn, delay dispose slightly to let
    // the final generating=false write propagate unless explicitly forced.
    // This works around a known race in @cocalc/sync (src/packages/sync)
    // where very fast true→false toggles can be dropped; the delay gives
    // the final state a chance to land. Remove once the sync bug is fixed.
    if (!forceImmediate && this.finished) {
      if (this.disposeTimer) return;
      this.disposeTimer = setTimeout(() => this.dispose(true), 1500);
      return;
    }

    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = undefined;
    }
    this.commit(false);
    this.commit.flush();
    this.closed = true;
    chatWritersByChatKey.delete(this.chatKey);
    for (const key of this.threadKeys) {
      const writer = chatWritersByThreadId.get(key);
      if (writer === this) {
        chatWritersByThreadId.delete(key);
      }
    }
    this.threadKeys.clear();
    if (!this.finished) {
      clearAcpPayloads(this.metadata);
    }
    try {
      this.persistLogProgress.flush();
    } catch {
      // ignore
    }
    void this.persistLog();
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

  addLocalEvent(event: AcpStreamEvent): void {
    if (this.closed) return;
    const message: AcpStreamMessage = {
      type: "event",
      event,
      seq: this.seq++,
    };
    this.processPayload(message, { persist: true });
    this.commit(true);
  }

  notifyInterrupted(text: string): void {
    if (this.interruptNotified) return;
    this.interruptNotified = true;
    this.interruptedMessage = text;
    this.addLocalEvent({
      type: "message",
      text,
    });
  }

  getKnownThreadIds(): string[] {
    const ids: string[] = [];
    if (this.threadId) ids.push(this.threadId);
    if (this.sessionKey) ids.push(this.sessionKey);
    return Array.from(new Set(ids));
  }

  private registerThreadKey(key: string): void {
    if (!key) return;
    this.threadKeys.add(key);
    chatWritersByThreadId.set(key, this);
  }

  private getLogStore(): AKV<AcpStreamMessage[]> {
    if (this.logStore) return this.logStore;
    this.logStore = akv<AcpStreamMessage[]>({
      project_id: this.metadata.project_id,
      name: this.logStoreName,
      client: this.client,
    });
    return this.logStore;
  }

  private publishLog(event: AcpStreamMessage): void {
    if (this.closed) return;
    void this.client
      .publish(this.logSubject, event)
      .catch((err) => logger.debug("publish log failed", err));
  }

  private async persistLog(): Promise<void> {
    if (this.events.length === 0) return;
    try {
      const store = this.getLogStore();
      await store.set(this.logKey, this.events);
    } catch (err) {
      logger.warn("failed to persist acp log", err);
    }
  }
}

function getLatestMessageText(events: AcpStreamMessage[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt?.type === "event" && evt.event?.type === "message") {
      const text = evt.event.text;
      if (typeof text === "string") {
        return text;
      }
    }
  }
  return undefined;
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
  const autoApprove =
    sessionMode === "full-access"
      ? (event: ApprovalEvent) => {
          const option =
            event.options.find((opt) => opt.kind?.startsWith("allow")) ??
            event.options[0];
          if (!option) return;
          const handled = resolveApproval({
            approvalId: event.approvalId,
            optionId: option.optionId,
            decidedBy: request.account_id,
            note: "Auto-approved (full access)",
          });
          if (!handled) {
            logger.warn("auto approval failed", {
              approvalId: event.approvalId,
            });
          }
        }
      : undefined;

  const chatWriter = request.chat
    ? new ChatStreamWriter({
        metadata: request.chat,
        client: conatClient,
        autoApprove,
        approverAccountId: request.account_id,
        sessionKey: request.session_id ?? undefined,
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
  await initConatAcp(
    {
      evaluate,
      approval: handleApprovalDecisionRequest,
      interrupt: handleInterruptRequest,
    },
    client,
  );
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

async function handleApprovalDecisionRequest(
  request: AcpApprovalDecisionRequest,
): Promise<void> {
  const pending = approvalStore.get(request.approvalId);
  if (!pending) {
    throw Error("approval is no longer pending");
  }
  if (pending.approverAccountId !== request.account_id) {
    throw Error("not authorized to resolve this approval");
  }
  const handled = resolveApproval({
    approvalId: request.approvalId,
    optionId: request.optionId,
    decidedBy: request.account_id,
    note: request.note,
  });
  if (!handled) {
    approvalStore.remove(request.approvalId);
    throw Error("approval could not be resolved");
  }
  approvalStore.remove(request.approvalId);
}

async function handleInterruptRequest(
  request: AcpInterruptRequest,
): Promise<void> {
  const writer = findChatWriter({
    threadId: request.threadId,
    chat: request.chat,
  });

  const candidateIds: Set<string> = new Set();
  if (request.threadId) {
    candidateIds.add(request.threadId);
  }
  writer?.getKnownThreadIds().forEach((id) => candidateIds.add(id));

  let handled = false;
  for (const id of candidateIds) {
    if (!id) continue;
    if (await interruptCodexSession(id)) {
      handled = true;
      break;
    }
  }

  if (!handled) {
    throw Error("unable to interrupt codex session");
  }
  writer?.notifyInterrupted(INTERRUPT_STATUS_TEXT);
}

async function interruptCodexSession(threadId: string): Promise<boolean> {
  for (const agent of agents.values()) {
    if (agent instanceof CodexAcpAgent) {
      try {
        if (await agent.interrupt(threadId)) {
          return true;
        }
      } catch (err) {
        logger.warn("failed to interrupt codex session", {
          threadId,
          err,
        });
      }
    }
  }
  return false;
}
