import { EventEmitter } from "events";
import type { ImmerDB } from "@cocalc/sync/editor/immer-db";
import { normalizeChatMessage } from "./normalize";
import type { PlainChatMessage } from "./types";

/**
 * ChatMessageCache
 *
 * - Maintains a single normalized Map of chat messages keyed by ms timestamp (as string).
 * - Listens to syncdb "change" events to update incrementally; one cache per syncdoc.
 * - Emits a monotonically increasing version so React and Actions can subscribe
 *   without recomputing the whole document.
 * - Stored records are the same plain/frozen objects that ImmerDB holds internally,
 *   so unchanged rows are structurally shared (no duplicate deep copies).
 *
 * This is the single source of truth for processed messages across both the
 * React components (via ChatDocProvider) and ChatActions; it avoids rebuilding
 * on every call and keeps O(1) updates relative to syncdb changes.
 */
export class ChatMessageCache {
  private syncdb?: ImmerDB;
  private messages: Map<string, PlainChatMessage> = new Map();
  private version = 0;
  private emitter = new EventEmitter();
  private onChangeBound = this.onChange.bind(this);

  constructor(syncdb?: ImmerDB) {
    if (syncdb) {
      this.setSyncdb(syncdb);
    }
  }

  setSyncdb(syncdb: ImmerDB) {
    if (this.syncdb === syncdb) return;
    if (this.syncdb) {
      this.syncdb.off("change", this.onChangeBound);
    }
    this.syncdb = syncdb;
    // Clear stale data; populate from the next change event after ready.
    this.messages = new Map();
    // If already ready (e.g., hot swap), build immediately.
    if (this.syncdb.get_state?.() === "ready") {
      this.rebuildFromDoc();
    }
    this.syncdb.on("change", this.onChangeBound);
  }

  getSyncdb(): ImmerDB | undefined {
    return this.syncdb;
  }

  getMessages(): Map<string, PlainChatMessage> {
    return this.messages;
  }

  getVersion(): number {
    return this.version;
  }

  onVersion(cb: (v: number) => void) {
    this.emitter.on("version", cb);
  }

  offVersion(cb: (v: number) => void) {
    this.emitter.off("version", cb);
  }

  dispose() {
    if (this.syncdb) {
      this.syncdb.off("change", this.onChangeBound);
    }
    this.messages.clear();
    this.emitter.removeAllListeners();
  }

  private bumpVersion() {
    this.version += 1;
    this.emitter.emit("version", this.version);
  }

  private rebuildFromDoc() {
    if (!this.syncdb || this.syncdb.get_state?.() !== "ready") {
      return;
    }
    const map = new Map<string, PlainChatMessage>();
    const rows = this.syncdb.get() ?? [];
    for (const row of rows ?? []) {
      const { message } = normalizeChatMessage(row);
      if (message) {
        map.set(`${message.date.valueOf()}`, message);
      }
    }
    this.messages = map;
    this.bumpVersion();
  }

  private onChange(changes: Set<Record<string, unknown>> | undefined) {
    if (!this.syncdb || this.syncdb.get_state?.() !== "ready") return;
    const m = new Map(this.messages);
    const rows: Record<string, unknown>[] =
      changes instanceof Set
        ? Array.from(changes)
        : changes == null
          ? []
          : [changes];
    for (const row of rows) {
      // SyncDoc.get_one requires only primary key fields.
      const where: Record<string, unknown> = {};
      if (row?.event != null) where.event = row.event;
      if (row?.sender_id != null) where.sender_id = row.sender_id;
      if (row?.date != null) where.date = row.date;
      const rec = this.syncdb.get_one(where);
      if (!rec) {
        const key =
          row?.date != null
            ? `${new Date(row.date as string | number | Date).valueOf()}`
            : undefined;
        if (key != null) {
          m.delete(key);
        }
        continue;
      }
      const { message } = normalizeChatMessage(rec);
      const key =
        message?.date != null
          ? `${message.date.valueOf()}`
          : row?.date
            ? `${new Date(row.date as string).valueOf()}`
            : undefined;
      if (key == null) continue;
      if (message) {
        m.set(key, message);
      } else {
        m.delete(key);
      }
    }
    this.messages = m;
    this.bumpVersion();
  }
}
