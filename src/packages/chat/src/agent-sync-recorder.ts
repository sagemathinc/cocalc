import { promises as fs } from "node:fs";
import path from "node:path";

import { getLogger } from "@cocalc/conat/client";
import type { Client as ConatClient } from "@cocalc/conat/core/client";
import { akv } from "@cocalc/conat/sync/akv";
import { getSyncDocType } from "@cocalc/conat/sync/syncdoc-info";
import type { JSONValue } from "@cocalc/util/types";

type PatchId = string;

export type AgentSyncDoc = {
  isReady: () => boolean;
  to_str: () => string;
  from_str: (value: string) => void;
  commit: (options?: { meta?: { [key: string]: JSONValue } }) => boolean;
  versions: () => PatchId[];
  newestVersion?: () => PatchId | undefined;
  hasVersion?: (patchId: PatchId) => boolean;
  version: (patchId: PatchId) => { to_str?: () => string };
  close: () => Promise<void>;
  once: (event: "ready" | "error", handler: (arg?: unknown) => void) => void;
};

type ReadState = {
  patchId: PatchId;
  atMs: number;
  lastReadTurnId?: string;
};

type ReadStateStore = {
  get: (key: string) => Promise<ReadState | undefined>;
  set: (key: string, value: ReadState) => Promise<void>;
  delete?: (key: string) => Promise<void>;
  close?: () => void;
};

type Logger = {
  debug: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type SyncDocEntry = {
  doc: AgentSyncDoc;
  lastUsedMs: number;
};

type SyncDocDescriptor = {
  type: "string" | "db";
  opts?: Record<string, unknown>;
};

type AgentTimeTravelRecorderOptions = {
  project_id: string;
  chat_path: string;
  thread_root_date: string;
  turn_date: string;
  log_store: string;
  log_key: string;
  log_subject: string;
  client: ConatClient;
  workspaceRoot: string;
  sessionId?: string;
  threadId?: string;
  allowWriteWithoutRead?: boolean;
  logger?: Logger;
  readStateStore?: ReadStateStore;
  syncFactory?: (relativePath: string) => Promise<AgentSyncDoc | undefined>;
  readFile?: (absolutePath: string) => Promise<string>;
  now?: () => number;
};

const DEFAULT_SYNC_DOC_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_DOC_CACHE_MAX = 32;
const DEFAULT_READ_STATE_TTL_MS = 6 * 60 * 60 * 1000;

export class AgentTimeTravelRecorder {
  // Record best-effort agent edits into patchflow without caching file contents.
  private readonly projectId: string;
  private readonly chatPath: string;
  private readonly threadRootDate: string;
  private readonly turnDate: string;
  private readonly logStore: string;
  private readonly logKey: string;
  private readonly logSubject: string;
  private readonly client: ConatClient;
  private readonly workspaceRoot: string;
  private readonly homeRoot: string | undefined;
  private readonly allowWriteWithoutRead: boolean;
  private readonly logger: Logger;
  private readonly store: ReadStateStore;
  private readonly syncDocCacheTtlMs: number;
  private readonly syncDocCacheMax: number;
  private readonly readStateTtlMs: number;
  private readonly syncDocs = new Map<string, SyncDocEntry>();
  private readonly syncDocLoads = new Map<
    string,
    Promise<AgentSyncDoc | undefined>
  >();
  private readonly docTypeCache = new Map<
    string,
    { entry: SyncDocDescriptor; atMs: number }
  >();
  private readonly readCache = new Map<string, ReadState>();
  private readonly syncFactory?: (
    relativePath: string,
  ) => Promise<AgentSyncDoc | undefined>;
  private readonly readFile: (absolutePath: string) => Promise<string>;
  private readonly now: () => number;
  private pruneTimer?: NodeJS.Timeout;
  private sessionId?: string;
  private threadId?: string;

  constructor(options: AgentTimeTravelRecorderOptions) {
    this.projectId = options.project_id;
    this.chatPath = options.chat_path;
    this.threadRootDate = options.thread_root_date;
    this.turnDate = options.turn_date;
    this.logStore = options.log_store;
    this.logKey = options.log_key;
    this.logSubject = options.log_subject;
    this.client = options.client;
    this.workspaceRoot = path.normalize(options.workspaceRoot ?? "");
    this.homeRoot = process.env.HOME;
    this.allowWriteWithoutRead = options.allowWriteWithoutRead ?? false;
    this.logger = options.logger ?? getLogger("chat:agent-time-travel");
    this.sessionId = options.sessionId;
    this.threadId = options.threadId;
    this.syncFactory = options.syncFactory;
    this.readFile =
      options.readFile ?? ((absolutePath) => fs.readFile(absolutePath, "utf8"));
    this.now = options.now ?? (() => Date.now());
    this.store =
      options.readStateStore ??
      this.buildDefaultStore({
        project_id: this.projectId,
        name: this.logStore,
        client: this.client,
      });
    this.syncDocCacheTtlMs = DEFAULT_SYNC_DOC_TTL_MS;
    this.syncDocCacheMax = DEFAULT_SYNC_DOC_CACHE_MAX;
    this.readStateTtlMs = DEFAULT_READ_STATE_TTL_MS;
    this.startPruneTimer();
  }

  setThreadId(threadId: string): void {
    this.threadId = threadId;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  async recordRead(filePath: string, turnId?: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return;
    const { relativePath } = resolved;
    const syncdoc = await this.getSyncDoc(relativePath);
    if (!syncdoc) {
      this.logger.debug("agent-tt skip read (no syncdoc)", { relativePath });
      return;
    }
    const patchId = this.getLatestPatchId(syncdoc);
    if (!patchId) {
      this.logger.debug("agent-tt skip read (no patch id)", { relativePath });
      return;
    }
    const readState: ReadState = {
      patchId,
      atMs: this.now(),
      lastReadTurnId: turnId ?? this.turnDate,
    };
    const key = this.readKey(relativePath);
    this.readCache.set(key, readState);
    await this.store.set(key, readState);
    this.logger.debug("agent-tt read cached", { relativePath, patchId });
  }

  async recordWrite(filePath: string, turnId?: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return;
    const { absolutePath, relativePath } = resolved;
    const syncdoc = await this.getSyncDoc(relativePath);
    if (!syncdoc) {
      this.logger.debug("agent-tt skip write (no syncdoc)", { relativePath });
      return;
    }

    let currentDisk: string | undefined;
    try {
      currentDisk = await this.readFile(absolutePath);
    } catch (err) {
      this.logger.debug("agent-tt skip write (disk read failed)", {
        relativePath,
        err,
      });
      return;
    }

    const headContent = syncdoc.to_str();
    if (headContent === currentDisk) {
      this.logger.debug("agent-tt skip write (already committed)", {
        relativePath,
      });
      return;
    }

    const readState = await this.getReadState(relativePath);
    if (!readState && !this.allowWriteWithoutRead) {
      this.logger.debug("agent-tt skip write (no read state)", {
        relativePath,
      });
      return;
    }

    if (readState) {
      const patchId = readState.patchId;
      if (!this.hasPatch(syncdoc, patchId)) {
        this.logger.debug("agent-tt skip write (missing patch id)", {
          relativePath,
          patchId,
        });
        return;
      }
      let baseContent: string | undefined;
      try {
        const docAtPatch = syncdoc.version(patchId);
        baseContent = docAtPatch?.to_str?.();
        if (baseContent == null) {
          this.logger.debug("agent-tt skip write (missing base content)", {
            relativePath,
            patchId,
          });
          return;
        }
      } catch (err) {
        this.logger.debug("agent-tt skip write (version lookup failed)", {
          relativePath,
          patchId,
          err,
        });
        return;
      }
      if (baseContent === currentDisk) {
        this.logger.debug("agent-tt skip write (no diff from read)", {
          relativePath,
          patchId,
        });
        return;
      }
      if (headContent !== baseContent && !this.allowWriteWithoutRead) {
        this.logger.debug("agent-tt skip write (head diverged)", {
          relativePath,
          patchId,
        });
        return;
      }
    }

    syncdoc.from_str(currentDisk);
    const meta = this.buildMeta({
      relativePath,
      turnId: turnId ?? this.turnDate,
    });
    const committed = syncdoc.commit({ meta });
    if (!committed) {
      this.logger.debug("agent-tt skip write (no commit)", { relativePath });
      return;
    }
    const newPatchId = this.getLatestPatchId(syncdoc);
    this.logger.debug("agent-tt commit", { relativePath, patchId: newPatchId });
  }

  async finalizeTurn(_turnId?: string): Promise<void> {
    this.pruneSyncDocs();
  }

  async dispose(): Promise<void> {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    for (const [relativePath, entry] of this.syncDocs.entries()) {
      await this.closeSyncDoc(relativePath, entry.doc);
    }
    this.syncDocs.clear();
    this.readCache.clear();
    this.docTypeCache.clear();
    this.store.close?.();
  }

  private buildDefaultStore(opts: {
    project_id: string;
    name: string;
    client: ConatClient;
  }): ReadStateStore {
    const store = akv<ReadState>({
      project_id: opts.project_id,
      name: opts.name,
      client: opts.client,
    });
    return {
      get: (key) => store.get(key),
      set: async (key, value) => {
        await store.set(key, value);
      },
      delete: (key) => store.delete(key),
      close: () => store.close(),
    };
  }

  private resolvePath(
    filePath: string,
  ): { absolutePath: string; relativePath: string } | undefined {
    if (!filePath || !this.workspaceRoot) return;
    const candidates: string[] = [];
    if (path.isAbsolute(filePath)) {
      candidates.push(path.normalize(filePath));
    } else {
      if (this.homeRoot) {
        candidates.push(path.resolve(this.homeRoot, filePath));
      }
      candidates.push(path.resolve(this.workspaceRoot, filePath));
    }

    for (const candidate of candidates) {
      if (!this.isUnderRoot(candidate, this.workspaceRoot)) continue;
      if (this.homeRoot && !this.isUnderRoot(candidate, this.homeRoot)) {
        continue;
      }
      const relativePath = path.relative(this.workspaceRoot, candidate);
      if (!relativePath || relativePath.startsWith("..")) continue;
      return { absolutePath: candidate, relativePath };
    }

    this.logger.debug("agent-tt skip path outside roots", {
      filePath,
      workspaceRoot: this.workspaceRoot,
      homeRoot: this.homeRoot,
    });
    return;
  }

  private isUnderRoot(candidate: string, root: string): boolean {
    const normalizedRoot = path.normalize(root);
    const normalizedCandidate = path.normalize(candidate);
    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(normalizedRoot + path.sep)
    );
  }

  private readKey(relativePath: string): string {
    return `agent-tt:${this.threadRootDate}:file:${relativePath}`;
  }

  private async getReadState(
    relativePath: string,
  ): Promise<ReadState | undefined> {
    const key = this.readKey(relativePath);
    const cached = this.readCache.get(key);
    if (cached && !this.isReadStateExpired(cached)) {
      return cached;
    }
    const stored = await this.store.get(key);
    if (!stored || this.isReadStateExpired(stored)) {
      return undefined;
    }
    this.readCache.set(key, stored);
    return stored;
  }

  private isReadStateExpired(state: ReadState): boolean {
    return this.now() - state.atMs > this.readStateTtlMs;
  }

  private getLatestPatchId(syncdoc: AgentSyncDoc): PatchId | undefined {
    try {
      if (typeof syncdoc.newestVersion === "function") {
        return syncdoc.newestVersion();
      }
      if (typeof syncdoc.versions === "function") {
        const versions = syncdoc.versions();
        return versions[versions.length - 1];
      }
    } catch (err) {
      this.logger.debug("agent-tt latest patch lookup failed", err);
    }
    return undefined;
  }

  private hasPatch(syncdoc: AgentSyncDoc, patchId: PatchId): boolean {
    try {
      if (typeof syncdoc.hasVersion === "function") {
        return syncdoc.hasVersion(patchId);
      }
      if (typeof syncdoc.versions === "function") {
        return syncdoc.versions().includes(patchId);
      }
    } catch (err) {
      this.logger.debug("agent-tt patch lookup failed", err);
    }
    return false;
  }

  private buildMeta({
    relativePath,
    turnId,
  }: {
    relativePath: string;
    turnId: string;
  }): { [key: string]: JSONValue } {
    const meta: { [key: string]: JSONValue } = {
      source: "agent",
      chat_thread_root_date: this.threadRootDate,
      chat_message_date: turnId,
      chat_path: this.chatPath,
      log_store: this.logStore,
      log_key: this.logKey,
      log_subject: this.logSubject,
      file_path: relativePath,
    };
    if (this.sessionId) {
      meta.agent_session_id = this.sessionId;
    }
    if (this.threadId) {
      meta.agent_thread_id = this.threadId;
    }
    return meta;
  }

  private startPruneTimer(): void {
    this.pruneTimer = setInterval(() => this.pruneSyncDocs(), 60_000);
    this.pruneTimer.unref?.();
  }

  private pruneSyncDocs(): void {
    const nowMs = this.now();
    for (const [relativePath, entry] of this.syncDocs.entries()) {
      if (nowMs - entry.lastUsedMs <= this.syncDocCacheTtlMs) continue;
      void this.closeSyncDoc(relativePath, entry.doc);
      this.syncDocs.delete(relativePath);
    }
    if (this.syncDocs.size <= this.syncDocCacheMax) return;
    const sorted = [...this.syncDocs.entries()].sort(
      (left, right) => left[1].lastUsedMs - right[1].lastUsedMs,
    );
    for (const [relativePath, entry] of sorted) {
      if (this.syncDocs.size <= this.syncDocCacheMax) break;
      void this.closeSyncDoc(relativePath, entry.doc);
      this.syncDocs.delete(relativePath);
    }
  }

  private async getSyncDoc(
    relativePath: string,
  ): Promise<AgentSyncDoc | undefined> {
    const cached = this.syncDocs.get(relativePath);
    const nowMs = this.now();
    if (cached && nowMs - cached.lastUsedMs <= this.syncDocCacheTtlMs) {
      cached.lastUsedMs = nowMs;
      return cached.doc;
    }

    const inflight = this.syncDocLoads.get(relativePath);
    if (inflight) {
      return await inflight;
    }

    const loadPromise = this.loadSyncDoc(relativePath).finally(() => {
      this.syncDocLoads.delete(relativePath);
    });
    this.syncDocLoads.set(relativePath, loadPromise);
    return await loadPromise;
  }

  private async loadSyncDoc(
    relativePath: string,
  ): Promise<AgentSyncDoc | undefined> {
    if (this.syncFactory) {
      try {
        const syncdoc = await this.syncFactory(relativePath);
        if (!syncdoc) return undefined;
        const readyDoc = syncdoc;
        if (!readyDoc.isReady()) {
          await new Promise<void>((resolve, reject) => {
            readyDoc.once("ready", () => resolve());
            readyDoc.once("error", (err) => reject(err));
          });
        }
        this.syncDocs.set(relativePath, {
          doc: readyDoc,
          lastUsedMs: this.now(),
        });
        this.pruneSyncDocs();
        return readyDoc;
      } catch (err) {
        this.logger.debug("agent-tt syncdoc factory failed", {
          relativePath,
          err,
        });
        return undefined;
      }
    }
    const descriptor = await this.resolveDocType(relativePath);
    let syncdoc: AgentSyncDoc | undefined;
    try {
      const options = {
        project_id: this.projectId,
        path: relativePath,
        noSaveToDisk: true,
        firstReadLockTimeout: 1,
      };
      if (descriptor.type === "db") {
        const primaryKeys = this.readStringArray(
          descriptor.opts?.primary_keys ?? descriptor.opts?.primaryKeys,
        );
        const stringCols = this.readStringArray(
          descriptor.opts?.string_cols ?? descriptor.opts?.stringCols,
        );
        if (primaryKeys.length === 0) {
          this.logger.debug("agent-tt fallback to string doc", {
            relativePath,
          });
          syncdoc = this.client.sync.string(options);
        } else {
          syncdoc = this.client.sync.immer({
            ...options,
            primary_keys: primaryKeys,
            string_cols: stringCols,
          });
        }
      } else {
        syncdoc = this.client.sync.string(options);
      }
      if (!syncdoc) {
        throw new Error("syncdoc initialization failed");
      }
      const readyDoc = syncdoc;
      if (!readyDoc.isReady()) {
        await new Promise<void>((resolve, reject) => {
          readyDoc.once("ready", () => resolve());
          readyDoc.once("error", (err) => reject(err));
        });
      }
    } catch (err) {
      this.logger.debug("agent-tt syncdoc init failed", {
        relativePath,
        err,
      });
      if (syncdoc) {
        await this.closeSyncDoc(relativePath, syncdoc);
      }
      return undefined;
    }

    this.syncDocs.set(relativePath, { doc: syncdoc, lastUsedMs: this.now() });
    this.pruneSyncDocs();
    return syncdoc;
  }

  private async closeSyncDoc(
    relativePath: string,
    syncdoc: AgentSyncDoc,
  ): Promise<void> {
    try {
      await syncdoc.close();
    } catch (err) {
      this.logger.debug("agent-tt syncdoc close failed", {
        relativePath,
        err,
      });
    }
  }

  private async resolveDocType(
    relativePath: string,
  ): Promise<SyncDocDescriptor> {
    const cached = this.docTypeCache.get(relativePath);
    if (cached && this.now() - cached.atMs < this.syncDocCacheTtlMs) {
      return cached.entry;
    }
    try {
      const raw = (await getSyncDocType({
        client: this.client,
        project_id: this.projectId,
        path: relativePath,
      })) as SyncDocDescriptor;
      const entry: SyncDocDescriptor = {
        type: raw?.type === "db" ? "db" : "string",
        opts: raw?.opts,
      };
      this.docTypeCache.set(relativePath, { entry, atMs: this.now() });
      return entry;
    } catch (err) {
      this.logger.debug("agent-tt doctype lookup failed", {
        relativePath,
        err,
      });
      return { type: "string" };
    }
  }

  private readStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (value instanceof Set) {
      return Array.from(value).filter(
        (item): item is string => typeof item === "string",
      );
    }
    return [];
  }
}
