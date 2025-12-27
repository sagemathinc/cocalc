import { EventEmitter } from "events";
import { enableMapSet, produce } from "immer";
import type { ImmerDB } from "@cocalc/sync/editor/immer-db";
import type { PlainChatMessage } from "./types";
import { once } from "@cocalc/util/async-utils";

/**
 * ChatMessageCache
 *
 * - Maintains a Map of chat messages keyed by ms timestamp (as string).
 * - Listens to syncdb "change" events to update incrementally; one cache per syncdoc.
 * - Emits a monotonically increasing version so React and Actions can subscribe
 *   without recomputing the whole document.
 * - Stored records are the same frozen objects that ImmerDB holds internally,
 *   so unchanged rows are structurally shared (no duplicate deep copies).
 *
 * This is the single source of truth for processed messages across both the
 * React components (via ChatDocProvider) and ChatActions; it avoids rebuilding
 * on every call and keeps O(1) updates relative to syncdb changes.
 */

// Enable Map mutation in immer drafts for efficient, immutable Map updates.
enableMapSet();

//const log = (...args) => console.log("message-cache", ...args);
const log = (..._args) => {};

export class ChatMessageCache extends EventEmitter {
  private syncdb: ImmerDB;
  private messages: Map<string, PlainChatMessage> = new Map();
  private version = 0;

  constructor(syncdb: ImmerDB) {
    super();
    this.syncdb = syncdb;
    log("constructor");
    // Normalize the initial Map through produce so it is frozen consistently.
    this.messages = produce(this.messages, () => {});
    this.syncdb.on("change", this.handleChange);
    if (
      this.syncdb.opts.ignoreInitialChanges ||
      this.syncdb.get_state() === "ready"
    ) {
      // If already ready (should never happen) *or* ignoreInitialChanges is set (should ALWAYS happen),
      // build immediately, which is vastly faster than churning through all changes.
      this.rebuildFromDoc();
    }
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

  dispose() {
    this.syncdb.off("change", this.handleChange);
    this.messages = new Map();
    this.removeAllListeners();
  }

  private bumpVersion() {
    this.version += 1;
    this.emit("version", this.version);
  }

  private getDateKey(row?: { date?: unknown }): string | undefined {
    if (!row?.date) return;
    const raw = row.date;
    const date =
      raw instanceof Date ? raw : new Date(raw as string | number | Date);
    if (!Number.isFinite(date.valueOf())) return;
    return `${date.valueOf()}`;
  }

  private async rebuildFromDoc() {
    log("rebuildFromDoc");
    if (this.syncdb.get_state() !== "ready") {
      log("rebuildFromDoc: waiting until ready");
      try {
        await once(this.syncdb, "ready");
      } catch (err) {
        log("rebuildFromDoc: never ready", err);
        return;
      }
    }
    const map = new Map<string, PlainChatMessage>();
    const rows = this.syncdb.get() ?? [];
    log("rebuildFromDoc: got rows", rows);

    for (const row0 of rows ?? []) {
      if (row0?.event !== "chat") continue;
      const key = this.getDateKey(row0);
      if (!key) continue;
      map.set(key, row0 as PlainChatMessage);
    }
    // Freeze the rebuilt Map for consistency with produce() updates.
    this.messages = produce(map, () => {});
    this.bumpVersion();
  }

  // assumed is an => function (so bound)
  private handleChange = (
    changes: Set<Record<string, unknown>> | undefined,
  ) => {
    if (changes == null || changes.size === 0) {
      return;
    }
    log("handleChange", changes);
    if (this.syncdb.get_state() !== "ready") return;
    const rows: Record<string, unknown>[] = Array.from(changes);
    const next = produce(this.messages, (draft) => {
      for (const row0 of rows) {
        if (!row0?.date) continue;
        // SyncDoc.get_one requires only primary key fields so we make an object
        // where that ONLY has those fields and no others.
        const where: Record<string, unknown> = {};
        if (row0?.event != null) where.event = row0.event;
        if (row0?.sender_id != null) where.sender_id = row0.sender_id;
        if (row0?.date != null) where.date = row0.date;
        const rec = this.syncdb.get_one(where);
        const key = this.getDateKey(rec ?? row0);
        if (!key) continue;
        if (!rec || rec?.event !== "chat") {
          draft.delete(key);
          continue;
        }
        draft.set(key, rec as PlainChatMessage);
      }
    });
    this.messages = next;
    this.bumpVersion();
  };
}
