/*
core-stream.ts  = the Core Stream data structure for conat.

This is the core data structure that easy-to-use ephemeral and persistent
streams and kv stores are built on.  It is NOT meant to be super easy and
simple to use, with save in the background. Instead, operations
are async, and the API is complicated. We build dkv, dstream, akv, etc. on
top of this with a much friendly API.

NOTE: unlike in conat, in kv mode, the keys can be any utf-8 string.
We use the subject to track communication involving this stream, but
otherwise it has no relevant to the keys.   Conat's core pub/sub/request/
reply model is very similar to NATS, but the analogue of Jetstream is
different because I don't find Jetstream useful at all, and find this
much more useful.

DEVELOPMENT:

~/cocalc/src/packages/backend$ node

   require('@cocalc/backend/conat'); a = require('@cocalc/conat/sync/core-stream'); s = await a.cstream({name:'test'})

*/

import { EventEmitter } from "events";
import {
  Message,
  type Headers,
  messageData,
  decode,
} from "@cocalc/conat/core/client";
import { isNumericString } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";
import { conat } from "@cocalc/conat/client";
import type { Client } from "@cocalc/conat/core/client";
import jsonStableStringify from "json-stable-stringify";
import type {
  SetOperation,
  DeleteOperation,
  StoredMessage,
  Configuration,
} from "@cocalc/conat/persist/storage";
import type { Changefeed } from "@cocalc/conat/persist/client";
export type { Configuration };
import { join } from "path";
import {
  type StorageOptions,
  type PersistStreamClient,
  stream as persist,
  type SetOptions,
} from "@cocalc/conat/persist/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { until } from "@cocalc/util/async-utils";
import { type PartialInventory } from "@cocalc/conat/persist/storage";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("sync:core-stream");

const PUBLISH_MANY_BATCH_SIZE = 500;

const DEFAULT_GET_ALL_TIMEOUT = 15000;

const log = (..._args) => {};
//const log = console.log;

// when this many bytes of key:value have been changed (so need to be freed),
// we do a garbage collection pass.
export const KEY_GC_THRESH = 10 * 1e6;

// NOTE: when you do delete this.deleteKv(key), we ensure the previous
// messages with the given key is completely deleted from sqlite, and
// also create a *new* lightweight tombstone. That tombstone has this
// ttl, which defaults to DEFAULT_TOMBSTONE_TTL (one week), so the tombstone
// itself will be removed after 1 week.  The tombstone is only needed for
// clients that go offline during the delete, then come back, and reply the
// partial log of what was missed.  Such clients should reset if the
// offline time is longer than DEFAULT_TOMBSTONE_TTL.
// This only happens if allow_msg_ttl is configured to true, which is
// done with dkv, but not on by default otherwise.
export const DEFAULT_TOMBSTONE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

export interface RawMsg extends Message {
  timestamp: number;
  seq: number;
  key?: string;
}

export interface ChangeEvent<T> {
  mesg?: T;
  raw?: Partial<RawMsg>;
  key?: string;
  prev?: T;
  msgID?: string;
}

const HEADER_PREFIX = "CN-";

export const COCALC_TOMBSTONE_HEADER = `${HEADER_PREFIX}Tombstone`;
export const COCALC_STREAM_HEADER = `${HEADER_PREFIX}Stream`;
export const COCALC_OPTIONS_HEADER = `${HEADER_PREFIX}Options`;

export interface CoreStreamOptions {
  // what it's called
  name: string;
  // where it is located -- this is who **owns the resource**, which
  // may or may not being who is accessing it.
  account_id?: string;
  project_id?: string;
  config?: Partial<Configuration>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;

  ephemeral?: boolean;
  sync?: boolean;

  client?: Client;

  noCache?: boolean;

  // the name of the cluster of persistence servers to use -- this is
  // by default SERVICE from conat/persist/util.ts.  Set it to something
  // else to use special different servers, e.g., we use a different service
  // for sharing cluster state date, where the servers are ephemeral and
  // there is one for each node.
  service?: string;
}

export interface User {
  account_id?: string;
  project_id?: string;
}

export function storagePath({
  account_id,
  project_id,
  name,
}: User & { name: string }) {
  let userPath;
  if (account_id) {
    userPath = `accounts/${account_id}`;
  } else if (project_id) {
    userPath = `projects/${project_id}`;
  } else {
    userPath = "hub";
  }
  return join(userPath, name);
}

export class CoreStream<T = any> extends EventEmitter {
  public readonly name: string;

  private configOptions?: Partial<Configuration>;
  private _start_seq?: number;

  // don't do "this.raw=" or "this.messages=" anywhere in this class
  // because dstream directly references the public raw/messages.
  public readonly raw: RawMsg[] = [];
  public readonly messages: T[] = [];
  public readonly kv: { [key: string]: { mesg: T; raw: RawMsg } } = {};
  private kvChangeBytes = 0;

  // this msgID's is ONLY used in ephemeral mode by the leader.
  private readonly msgIDs = new Set<any>();
  // lastSeq used by clients to keep track of what they have received; if one
  // is skipped they reconnect starting with the last one they didn't miss.
  private lastSeq: number = 0;
  // IMPORTANT: user here means the *owner* of the resource, **NOT** the
  // client who is accessing it!  For example, a stream of edits of a file
  // in a project has user {project_id} even if it is being accessed by
  // an account.
  private user: User;
  private storage: StorageOptions;
  private client?: Client;
  private persistClient: PersistStreamClient;
  private changefeed?: Changefeed;
  private service?: string;

  constructor({
    name,
    project_id,
    account_id,
    config,
    start_seq,
    ephemeral = false,
    sync,
    client,
    service,
  }: CoreStreamOptions) {
    super();
    logger.debug("constructor", name);
    if (client == null) {
      throw Error("client must be specified");
    }
    this.client = client;
    this.service = service;
    this.user = { account_id, project_id };
    this.name = name;
    this.storage = {
      path: storagePath({ account_id, project_id, name }),
      ephemeral,
      sync,
    };
    this._start_seq = start_seq;
    this.configOptions = config;
    return new Proxy(this, {
      get(target, prop) {
        return typeof prop == "string" && isNumericString(prop)
          ? target.get(parseInt(prop))
          : target[String(prop)];
      },
    });
  }

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    if (this.client == null) {
      this.client = await conat();
    }
    this.persistClient = persist({
      client: this.client,
      user: this.user,
      storage: this.storage,
      service: this.service,
    });
    this.persistClient.on("error", (err) => {
      if (!process.env.COCALC_TEST_MODE) {
        console.log(`WARNING: persistent stream issue -- ${err}`);
      }
    });
    await this.getAllFromPersist({
      start_seq: this._start_seq,
      noEmit: true,
    });

    await until(
      async () => {
        if (this.client == null) {
          return true;
        }
        try {
          this.configOptions = await this.config(this.configOptions);
          return true;
        } catch (err) {
          if (err.code == 403) {
            // fatal permission error
            throw err;
          }
        }
        return false;
      },
      { start: 750 },
    );
  };

  config = async (
    config: Partial<Configuration> = {},
  ): Promise<Configuration> => {
    if (this.storage == null) {
      throw Error("bug -- storage must be set");
    }
    return await this.persistClient.config({ config });
  };

  private isClosed = () => {
    return this.client === undefined;
  };

  close = () => {
    logger.debug("close", this.name);
    delete this.client;
    this.removeAllListeners();
    this.persistClient?.close();
    // @ts-ignore
    delete this.persistClient;
    // @ts-ignore
    delete this.kv;
    // @ts-ignore
    delete this.messages;
    // @ts-ignore
    delete this.raw;
    // @ts-ignore
    delete this.msgIDs;
    // @ts-ignore
    delete this.storage;
  };

  inventory = async (): Promise<PartialInventory> => {
    return await this.persistClient.inventory();
  };

  // NOTE: It's assumed elsewhere that getAllFromPersist will not throw,
  // and will keep retrying until (1) it works, or (2) self is closed,
  // or (3) there is a fatal failure, e.g., lack of permissions.
  private getAllFromPersist = async ({
    start_seq = 0,
    noEmit,
  }: { start_seq?: number; noEmit?: boolean } = {}) => {
    if (this.storage == null) {
      throw Error("bug -- storage must be set");
    }
    await until(
      async () => {
        let messages: StoredMessage[] = [];
        let changes: (SetOperation | DeleteOperation | StoredMessage)[] = [];
        try {
          if (this.isClosed()) {
            return true;
          }
          if (this.changefeed == null) {
            this.changefeed = await this.persistClient.changefeed();
          }
          // console.log("get persistent stream", { start_seq }, this.storage);
          messages = await this.persistClient.getAll({
            start_seq,
            timeout: DEFAULT_GET_ALL_TIMEOUT,
          });
        } catch (err) {
          if (this.isClosed()) {
            return true;
          }
          if (!process.env.COCALC_TEST_MODE) {
            console.log(
              `WARNING: getAllFromPersist - failed -- ${err}, code=${err.code}, service=${this.service}, storage=${JSON.stringify(this.storage)} -- will retry`,
            );
          }
          if (err.code == 503 || err.code == 408) {
            // 503: temporary error due to messages being dropped,
            // so return false to try again. This is expected to
            // sometimes happen under heavy load, automatic failover, etc.
            // 408: timeout waiting to be connected/ready
            return false;
          }
          if (err.code == 403) {
            // fatal permission error
            throw err;
          }
          if (err.code == 429) {
            // too many users
            throw err;
          }
          // any other error that we might not address above -- just try again in a while.
          return false;
        }
        this.processPersistentMessages(messages, {
          noEmit,
          noSeqCheck: true,
        });
        if (changes.length > 0) {
          this.processPersistentMessages(changes, {
            noEmit,
            noSeqCheck: false,
          });
        }
        // success!
        return true;
      },
      { start: 1000, max: 15000 },
    );

    this.listen();
  };

  private processPersistentMessages = (
    messages: (SetOperation | DeleteOperation | StoredMessage)[],
    opts: { noEmit?: boolean; noSeqCheck?: boolean },
  ) => {
    if (this.raw === undefined) {
      // closed
      return;
    }
    let seq = undefined;
    for (const mesg of messages) {
      try {
        this.processPersistentMessage(mesg, opts);
        if (mesg["seq"] != null) {
          seq = mesg["seq"];
        }
      } catch (err) {
        console.log("WARNING: issue processing message", mesg, err);
      }
    }
    return seq;
  };

  private processPersistentMessage = (
    mesg: SetOperation | DeleteOperation | StoredMessage,
    opts: { noEmit?: boolean; noSeqCheck?: boolean },
  ) => {
    if ((mesg as DeleteOperation).op == "delete") {
      this.processPersistentDelete(mesg as DeleteOperation, opts);
    } else {
      // set is the default
      this.processPersistentSet(mesg as SetOperation, opts);
    }
  };

  private processPersistentDelete = (
    { seqs }: DeleteOperation,
    { noEmit }: { noEmit?: boolean },
  ) => {
    if (this.raw == null) return;
    const X = new Set<number>(seqs);
    // seqs is a list of integers.  We remove
    // every entry from this.raw, this.messages, and this.kv
    // where this.raw.seq is in X by mutating raw/messages/kv,
    // not by making new objects (since external references).
    // This is a rare operation so we're not worried too much
    // about performance.
    const keys: { [seq: number]: string } = {};
    for (const key in this.kv) {
      const seq = this.kv[key]?.raw?.seq;
      if (X.has(seq)) {
        delete this.kv[key];
        keys[key] = seq;
      }
    }
    const indexes: number[] = [];
    for (let i = 0; i < this.raw.length; i++) {
      const seq = this.raw[i].seq;
      if (X.has(seq)) {
        indexes.push(i);
        if (!noEmit) {
          this.emitChange({
            mesg: undefined,
            raw: { seq },
            key: keys[seq],
            prev: this.messages[i],
          });
        }
      }
    }

    // remove this.raw[i] and this.messages[i] for all i in indexes,
    // with special case to be fast in the very common case of contiguous indexes.
    if (indexes.length > 1 && indexes.every((v, i) => v === indexes[0] + i)) {
      // Contiguous: bulk remove for performance
      const start = indexes[0];
      const deleteCount = indexes.length;
      this.raw.splice(start, deleteCount);
      this.messages.splice(start, deleteCount);
    } else {
      // Non-contiguous: fallback to individual reverse splices
      for (let i = indexes.length - 1; i >= 0; i--) {
        const idx = indexes[i];
        this.raw.splice(idx, 1);
        this.messages.splice(idx, 1);
      }
    }
  };

  private processPersistentSetLargestSeq: number = 0;
  private missingMessages = new Set<number>();
  private processPersistentSet = (
    { seq, time, key, encoding, raw: data, headers, msgID }: SetOperation,
    {
      noEmit,
      noSeqCheck,
    }: {
      noEmit?: boolean;
      noSeqCheck?: boolean;
    },
  ) => {
    if (this.raw == null) return;
    if (!noSeqCheck) {
      const expected = this.processPersistentSetLargestSeq + 1;
      if (seq > expected) {
        log(
          "processPersistentSet -- detected missed seq number",
          { seq, expected: this.processPersistentSetLargestSeq + 1 },
          this.storage,
        );
        // We record that some are missing.
        for (let s = expected; s <= seq - 1; s++) {
          this.missingMessages.add(s);
          this.getAllMissingMessages();
        }
      }
    }

    if (seq > this.processPersistentSetLargestSeq) {
      this.processPersistentSetLargestSeq = seq;
    }

    const mesg = decode({ encoding, data });
    const raw = {
      timestamp: time,
      headers,
      seq,
      raw: data,
      key,
    } as RawMsg;
    if (seq > (this.raw.slice(-1)[0]?.seq ?? 0)) {
      // easy fast initial load to the end of the list (common special case)
      this.messages.push(mesg);
      this.raw.push(raw);
    } else {
      // Insert in the correct place.  This should only
      // happen when calling load of old data, which happens, e.g., during
      // automatic failover.  The algorithm below is
      // dumb and could be replaced by a binary search.  However, we'll
      // change how we batch load so there's less point.
      let i = 0;
      while (i < this.raw.length && this.raw[i].seq < seq) {
        i += 1;
      }
      // after the above loop, either:
      //   - this.raw[i] is undefined because i = this.raw.length and every known entry was less than seq,
      //     so we just append it, or
      //   - this.raw[i] is defined and this.raw[i].seq >= seq.  If they are equal, do nothing, since we already
      //     have it.  If not equal, then splice it in.
      if (i >= this.raw.length) {
        this.raw.push(raw);
        this.messages.push(mesg);
      } else if (this.raw[i].seq > seq) {
        this.raw.splice(i, 0, raw);
        this.messages.splice(i, 0, mesg);
      } // other case -- we already have it.
    }
    let prev: T | undefined = undefined;
    if (typeof key == "string") {
      prev = this.kv[key]?.mesg;
      if (raw.headers?.[COCALC_TOMBSTONE_HEADER]) {
        delete this.kv[key];
      } else {
        if (this.kv[key] !== undefined) {
          const { raw } = this.kv[key];
          this.kvChangeBytes += raw.raw.length;
        }

        this.kv[key] = { raw, mesg };

        if (this.kvChangeBytes >= KEY_GC_THRESH) {
          this.gcKv();
        }
      }
    }
    this.lastSeq = Math.max(this.lastSeq, seq);
    if (!noEmit) {
      this.emitChange({ mesg, raw, key, prev, msgID });
    }
  };

  private emitChange = (e: ChangeEvent<T>) => {
    if (this.raw == null) return;
    this.emit("change", e);
  };

  private listen = async () => {
    // log("core-stream: listen", this.storage);
    await until(
      async () => {
        if (this.isClosed()) {
          return true;
        }
        try {
          if (this.changefeed == null) {
            this.changefeed = await this.persistClient.changefeed();
            if (this.isClosed()) {
              return true;
            }
          }

          for await (const updates of this.changefeed) {
            this.processPersistentMessages(updates, {
              noEmit: false,
              noSeqCheck: false,
            });
            if (this.isClosed()) {
              return true;
            }
          }
        } catch (err) {
          // There should never be a case where the changefeed throws
          // an error or ends without this whole streaming being closed.
          // If that happens its an unexpected bug. Instead of failing,
          // we log this, loop around, and make a new changefeed.
          // This normally doesn't happen but could if a persist server is being restarted
          // frequently or things are seriously broken.  We cause this in
          //    backend/conat/test/core/core-stream-break.test.ts
          if (!process.env.COCALC_TEST_MODE) {
            log(
              `WARNING: core-stream changefeed error -- ${err}`,
              this.storage,
            );
          }
        }

        delete this.changefeed;

        // above loop exits when the persistent server
        // stops sending messages for some reason. In that
        // case we reconnect, picking up where we left off.

        if (this.client == null) {
          return true;
        }

        await this.getAllFromPersist({
          start_seq: this.lastSeq + 1,
          noEmit: false,
        });
        return false;
      },
      { start: 500, max: 7500, decay: 1.2 },
    );
  };

  publish = async (
    mesg: T,
    options?: PublishOptions,
  ): Promise<{ seq: number; time: number } | undefined> => {
    if (mesg === undefined) {
      if (options?.key !== undefined) {
        // undefined can't be JSON encoded, so we can't possibly represent it, and this
        // *must* be treated as a delete.
        this.deleteKv(options?.key, { previousSeq: options?.previousSeq });
        return;
      } else {
        throw Error("stream non-kv publish - mesg must not be 'undefined'");
      }
    }

    if (options?.msgID && this.msgIDs.has(options.msgID)) {
      // it's a dup
      return;
    }
    const md = messageData(mesg, { headers: options?.headers });
    const x = await this.persistClient.set({
      key: options?.key,
      messageData: md,
      previousSeq: options?.previousSeq,
      msgID: options?.msgID,
      ttl: options?.ttl,
      timeout: options?.timeout,
    });
    if (options?.msgID) {
      this.msgIDs?.add(options.msgID);
    }
    return x;
  };

  publishMany = async (
    messages: { mesg: T; options?: PublishOptions }[],
  ): Promise<
    ({ seq: number; time: number } | { error: string; code?: any })[]
  > => {
    let result: (
      | { seq: number; time: number }
      | { error: string; code?: any }
    )[] = [];

    for (let i = 0; i < messages.length; i += PUBLISH_MANY_BATCH_SIZE) {
      const batch = messages.slice(i, i + PUBLISH_MANY_BATCH_SIZE);
      result = result.concat(await this.publishMany0(batch));
    }

    return result;
  };

  private publishMany0 = async (
    messages: { mesg: T; options?: PublishOptions }[],
  ): Promise<
    ({ seq: number; time: number } | { error: string; code?: any })[]
  > => {
    const v: SetOptions[] = [];
    let timeout: number | undefined = undefined;
    for (const { mesg, options } of messages) {
      if (options?.timeout) {
        if (timeout === undefined) {
          timeout = options.timeout;
        } else {
          timeout = Math.min(timeout, options.timeout);
        }
      }
      const md = messageData(mesg, { headers: options?.headers });
      v.push({
        key: options?.key,
        messageData: md,
        previousSeq: options?.previousSeq,
        msgID: options?.msgID,
        ttl: options?.ttl,
      });
    }
    return await this.persistClient.setMany(v, { timeout });
  };

  get = (n?): T | T[] => {
    if (n == null) {
      return this.getAll();
    } else {
      return this.messages[n];
    }
  };

  seq = (n: number): number | undefined => {
    return this.raw[n]?.seq;
  };

  getAll = (): T[] => {
    return [...this.messages];
  };

  get length(): number {
    return this.messages.length;
  }

  get start_seq(): number | undefined {
    return this._start_seq;
  }

  headers = (n: number): { [key: string]: any } | undefined => {
    return this.raw[n]?.headers;
  };

  // key:value interface for subset of messages pushed with key option set.
  // NOTE: This does NOT throw an error if our local seq is out of date (leave that
  // to dkv built on this).
  setKv = async (
    key: string,
    mesg: T,
    options?: {
      headers?: Headers;
      previousSeq?: number;
    },
  ): Promise<{ seq: number; time: number } | undefined> => {
    return await this.publish(mesg, { ...options, key });
  };

  setKvMany = async (
    x: {
      key: string;
      mesg: T;
      options?: {
        headers?: Headers;
        previousSeq?: number;
      };
    }[],
  ): Promise<
    ({ seq: number; time: number } | { error: string; code?: any })[]
  > => {
    const messages: { mesg: T; options?: PublishOptions }[] = [];
    for (const { key, mesg, options } of x) {
      messages.push({ mesg, options: { ...options, key } });
    }
    return await this.publishMany(messages);
  };

  deleteKv = async (
    key: string,
    options?: {
      msgID?: string;
      previousSeq?: number;
    },
  ) => {
    if (this.kv[key] === undefined) {
      // nothing to do
      return;
    }
    return await this.publish(null as any, {
      ...options,
      headers: { [COCALC_TOMBSTONE_HEADER]: true },
      key,
      ttl: DEFAULT_TOMBSTONE_TTL,
    });
  };

  getKv = (key: string): T | undefined => {
    return this.kv[key]?.mesg;
  };

  hasKv = (key: string): boolean => {
    return this.kv?.[key] !== undefined;
  };

  getAllKv = (): { [key: string]: T } => {
    const all: { [key: string]: T } = {};
    for (const key in this.kv) {
      all[key] = this.kv[key].mesg;
    }
    return all;
  };

  // efficient way to get just the keys -- use this instead of
  // getAllKv if you just need the keys.
  keysKv = (): string[] => {
    return Object.keys(this.kv);
  };

  seqKv = (key: string): number | undefined => {
    return this.kv[key]?.raw.seq;
  };

  timeKv = (key?: string): Date | { [key: string]: Date } | undefined => {
    if (key === undefined) {
      const all: { [key: string]: Date } = {};
      for (const key in this.kv) {
        all[key] = new Date(this.kv[key].raw.timestamp);
      }
      return all;
    }
    const r = this.kv[key]?.raw;
    if (r == null) {
      return;
    }
    return new Date(r.timestamp);
  };

  headersKv = (key: string): { [key: string]: any } | undefined => {
    return this.kv[key]?.raw?.headers;
  };

  get lengthKv(): number {
    return Object.keys(this.kv).length;
  }

  // load older messages starting at start_seq up to the oldest message
  // we currently have.  This can throw an exception in case of heavy
  // load or network issues, but should completely succeed or make
  // no change.
  load = async ({
    start_seq,
    noEmit,
  }: {
    start_seq: number;
    noEmit?: boolean;
  }) => {
    // This is used for loading more TimeTravel history
    if (this.storage == null) {
      throw Error("bug");
    }
    // this is one before the oldest we have
    const end_seq = (this.raw[0]?.seq ?? this._start_seq ?? 1) - 1;
    if (start_seq > end_seq) {
      // nothing to load
      return;
    }
    // we're moving start_seq back to this point
    this._start_seq = start_seq;
    const messages = await this.persistClient.getAll({
      start_seq,
      end_seq,
    });
    this.processPersistentMessages(messages, { noEmit, noSeqCheck: true });
  };

  private getAllMissingMessages = reuseInFlight(async () => {
    await until(
      async () => {
        if (this.client == null || this.missingMessages.size == 0) {
          return true;
        }
        try {
          const missing = Array.from(this.missingMessages);
          missing.sort();
          log("core-stream: getMissingSeq", missing, this.storage);
          const messages = await this.persistClient.getAll({
            start_seq: missing[0],
            end_seq: missing[missing.length - 1],
          });
          this.processPersistentMessages(messages, {
            noEmit: false,
            noSeqCheck: true,
          });
          for (const seq of missing) {
            this.missingMessages.delete(seq);
          }
        } catch (err) {
          log(
            "core-stream: WARNING -- issue getting missing updates",
            err,
            this.storage,
          );
        }
        return false;
      },
      { start: 1000, max: 15000, decay: 1.3 },
    );
  });

  // get server assigned time of n-th message in stream
  time = (n: number): Date | undefined => {
    const r = this.raw[n];
    if (r == null) {
      return;
    }
    return new Date(r.timestamp);
  };

  times = () => {
    const v: (Date | undefined)[] = [];
    for (let i = 0; i < this.length; i++) {
      v.push(this.time(i));
    }
    return v;
  };

  stats = ({
    start_seq = 1,
  }: {
    start_seq?: number;
  } = {}): { count: number; bytes: number } | undefined => {
    if (this.raw == null) {
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const { raw, seq } of this.raw) {
      if (seq == null) {
        continue;
      }
      if (seq < start_seq) {
        continue;
      }
      count += 1;
      bytes += raw.length;
    }
    return { count, bytes };
  };

  // delete all messages up to and including the
  // one at position index, i.e., this.messages[index]
  // is deleted.
  // NOTE: For ephemeral streams, clients will NOT see the result of a delete,
  // except when they load the stream later.  For persistent streams all
  // **connected** clients will see the delete.  THAT said, this is not a "proper"
  // distributed computing primitive with tombstones, etc.  This is primarily
  // meant for reducing space usage, and shouldn't be relied on for
  // any other purpose.
  delete = async ({
    all,
    last_index,
    seq,
    last_seq,
    key,
    seqs,
  }: {
    // give exactly ONE parameter -- by default nothing happens with no params
    // all: delete everything
    all?: boolean;
    // last_index: everything up to and including index'd message
    last_index?: number;
    // seq: delete message with this sequence number
    seq?: number;
    // seqs: delete the messages in this array of sequence numbers
    seqs?: number[];
    // last_seq: delete everything up to and including this sequence number
    last_seq?: number;
    // key: delete the message with this key
    key?: string;
  } = {}): Promise<{ seqs: number[] }> => {
    let opts;
    if (all) {
      opts = { all: true };
    } else if (last_index != null) {
      if (last_index >= this.raw.length) {
        opts = { all: true };
      } else if (last_index < 0) {
        return { seqs: [] };
      } else {
        const last_seq = this.raw[last_index].seq;
        if (last_seq === undefined) {
          throw Error(`BUG: invalid index ${last_index}`);
        }
        opts = { last_seq };
      }
    } else if (seq != null) {
      opts = { seq };
    } else if (seqs != null) {
      opts = { seqs };
    } else if (last_seq != null) {
      opts = { last_seq };
    } else if (key != null) {
      const seq = this.kv[key]?.raw?.seq;
      if (seq === undefined) {
        return { seqs: [] };
      }
      opts = { seq };
    }
    return await this.persistClient.delete(opts);
  };

  // delete messages that are no longer needed since newer values have been written
  gcKv = () => {
    this.kvChangeBytes = 0;
    for (let i = 0; i < this.raw.length; i++) {
      const key = this.raw[i].key;
      if (key !== undefined) {
        if (this.raw[i].raw.length > 0 && this.raw[i] !== this.kv[key].raw) {
          this.raw[i] = {
            ...this.raw[i],
            headers: undefined,
            raw: Buffer.from(""),
          } as RawMsg;
          this.messages[i] = undefined as T;
        }
      }
    }
  };
}

export interface PublishOptions {
  // headers for this message
  headers?: Headers;
  // unique id for this message to dedup so if you send the same
  // message more than once with the same id it doesn't get published
  // multiple times.
  msgID?: string;
  // key -- if specified a key field is also stored on the server,
  // and any previous messages with the same key are deleted. Also,
  // an entry is set in this.kv[key] so that this.getKv(key), etc. work.
  key?: string;
  // if key is specified and previousSeq is set, the server throws
  // an error if the sequence number of the current key is
  // not previousSeq.  We use this with this.seqKv(key) to
  // provide read/change/write semantics and to know when we
  // should resovle a merge conflict. This is ignored if
  // key is not specified.
  previousSeq?: number;
  // if set to a number of ms AND the config option allow_msg_ttl
  // is set on this persistent stream, then
  // this message will be deleted after the given amount of time (in ms).
  ttl?: number;
  timeout?: number;
}

export const cache = refCache<CoreStreamOptions, CoreStream>({
  name: "core-stream",
  createObject: async (options: CoreStreamOptions) => {
    if (options.client == null) {
      options = { ...options, client: await conat() };
    }
    const cstream = new CoreStream(options);
    await cstream.init();
    return cstream;
  },
  createKey: ({ client, ...options }) => {
    return jsonStableStringify({ id: client?.id, ...options })!;
  },
});

export async function cstream<T>(
  options: CoreStreamOptions,
): Promise<CoreStream<T>> {
  return await cache(options);
}
