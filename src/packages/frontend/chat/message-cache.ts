import { EventEmitter } from "events";
import type { ImmerDB } from "@cocalc/sync/editor/immer-db";
import { normalizeChatMessage } from "./normalize";
import type { PlainChatMessage } from "./types";
import { once } from "@cocalc/util/async-utils";

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

//const log = (...args) => console.log("message-cache", ...args);
const log = (..._args) => {};

export class ChatMessageCache extends EventEmitter {
  private syncdb: ImmerDB;
  private messages: Map<string, PlainChatMessage> = new Map();
  private version = 0;
  private onChangeBound = this.onChange.bind(this);

  constructor(syncdb: ImmerDB) {
    super();
    this.syncdb = syncdb;
    log("constructor");
    // Clear stale data; populate from the next change event after ready.
    this.messages = new Map();
    this.syncdb.on("change", this.onChangeBound);
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
    this.syncdb.off("change", this.onChangeBound);
    this.messages.clear();
    this.removeAllListeners();
  }

  private bumpVersion() {
    this.version += 1;
    this.emit("version", this.version);
  }

  // After calling this, if it returns true, then
  // the date field will be a valid ISO string
  private validateDate(row?: { date?: any }): any {
    // completely ignore any row whose date is not a valid -- there's nothing
    // to be done with such records.
    const date = row?.date;
    if (!date) {
      return;
    }
    if (typeof date != "string") {
      return;
    }
    try {
      const d = new Date(date);
      if (!isFinite(d.valueOf())) {
        return;
      }
      return { ...row, date: d.toISOString() };
    } catch (err) {
      // should not happen, hence log it
      console.log(err);
      return;
    }
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
    const toPersist: PlainChatMessage[] = [];
    log("rebuildFromDoc: got rows", rows);

    for (const row0 of rows ?? []) {
      const row = this.validateDate(row0);
      if (row == null) continue;
      const { message, upgraded } = normalizeChatMessage(row);
      if (message) {
        map.set(`${message.date.valueOf()}`, message);
        if (upgraded) {
          toPersist.push(message);
        }
      }
    }
    this.messages = map;
    if (toPersist.length > 0) {
      this.persist(toPersist);
    }
    this.bumpVersion();
  }

  private onChange(changes: Set<Record<string, unknown>> | undefined) {
    if (changes == null || changes.size === 0) {
      return;
    }
    log("onChange", changes);
    if (this.syncdb.get_state() !== "ready") return;
    const m = new Map(this.messages);
    const rows: Record<string, unknown>[] = Array.from(changes);
    const toPersist: PlainChatMessage[] = [];
    for (const row0 of rows) {
      const row = this.validateDate(row0);
      if (row == null) continue;
      // SyncDoc.get_one requires only primary key fields so we make an object
      // where that ONLY has those fields and no others.
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
      const { message, upgraded } = normalizeChatMessage(rec);
      const key =
        message?.date != null
          ? `${message.date.valueOf()}`
          : row?.date
            ? `${new Date(row.date as string).valueOf()}`
            : undefined;
      if (key == null) continue;
      if (message) {
        m.set(key, message);
        if (upgraded) {
          toPersist.push(message);
        }
      } else {
        m.delete(key);
      }
    }
    this.messages = m;
    if (toPersist.length > 0) {
      this.persist(toPersist);
    }
    this.bumpVersion();
  }

  // Commit upgrades outside the current call stack to avoid recursive change events.
  private persist(messages: PlainChatMessage[]) {
    if (this.syncdb.get_state() !== "ready") return;
    log("persist", messages.length);
    Promise.resolve().then(() => {
      if (this.syncdb && this.syncdb.get_state?.() === "ready") {
        let changed = false;
        for (const message of messages) {
          if (this.persistUpgrade(message)) {
            changed = true;
          }
        }
        if (changed) {
          this.syncdb.commit();
        }
      }
    });
  }

  // Persist upgraded schema/version back into syncdb so legacy rows are fixed on disk.
  private persistUpgrade(message: PlainChatMessage): boolean {
    if (this.syncdb.get_state() !== "ready") return false;
    // normalizeChatMessage guarantees a Date; skip if somehow not.
    const dateIso = message.date.toISOString();
    const toSave: any = {
      ...message,
      date: dateIso,
    };
    this.syncdb.set(toSave);
    console.log("set ", toSave);
    return true;
  }
}
