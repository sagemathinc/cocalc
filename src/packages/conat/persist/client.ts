import {
  type Message as ConatMessage,
  type Client,
  type MessageData,
  ConatError,
} from "@cocalc/conat/core/client";
import { type ConatSocketClient } from "@cocalc/conat/socket";
import { EventIterator } from "@cocalc/util/event-iterator";
import type {
  StorageOptions,
  Configuration,
  SetOperation,
  DeleteOperation,
  StoredMessage,
  PartialInventory,
} from "./storage";
export { StoredMessage, StorageOptions };
import { persistSubject, SERVICE, type User } from "./util";
import { assertHasWritePermission as assertHasWritePermission0 } from "./auth";
import { refCacheSync } from "@cocalc/util/refcache";
import { EventEmitter } from "events";
import { getLogger } from "@cocalc/conat/client";
import { until } from "@cocalc/util/async-utils";
import { getPersistServerId } from "./load-balancer";

let DEFAULT_RECONNECT_DELAY = 1500;
let DEFAULT_RECONNECT_DELAY_MAX = 30_000;
let DEFAULT_RECONNECT_DELAY_DECAY = 1.8;
let DEFAULT_RECONNECT_DELAY_JITTER = 0.25;
let DEFAULT_RECONNECT_STABLE_RESET_MS = 60_000;
let DEFAULT_RECOVERY_TIMEOUT = 30_000;

export function setDefaultReconnectDelay(delay) {
  DEFAULT_RECONNECT_DELAY = delay;
}

export function setDefaultReconnectOptions({
  start = DEFAULT_RECONNECT_DELAY,
  max = DEFAULT_RECONNECT_DELAY_MAX,
  decay = DEFAULT_RECONNECT_DELAY_DECAY,
  jitter = DEFAULT_RECONNECT_DELAY_JITTER,
  stableResetMs = DEFAULT_RECONNECT_STABLE_RESET_MS,
}: {
  start?: number;
  max?: number;
  decay?: number;
  jitter?: number;
  stableResetMs?: number;
}) {
  DEFAULT_RECONNECT_DELAY = start;
  DEFAULT_RECONNECT_DELAY_MAX = max;
  DEFAULT_RECONNECT_DELAY_DECAY = decay;
  DEFAULT_RECONNECT_DELAY_JITTER = jitter;
  DEFAULT_RECONNECT_STABLE_RESET_MS = stableResetMs;
}

export function setDefaultRecoveryTimeout(timeout: number) {
  DEFAULT_RECOVERY_TIMEOUT = timeout;
}

interface GetAllOpts {
  start_seq?: number;
  end_seq?: number;
  timeout?: number;
  maxWait?: number;
}

const logger = getLogger("persist:client");

export type ChangefeedEvent = (SetOperation | DeleteOperation)[];
export type Changefeed = EventIterator<ChangefeedEvent>;

type CounterByStorage = Map<string, number>;

const stats = {
  created: 0,
  closed: 0,
  active: 0,
  initCalls: 0,
  reconnectScheduled: 0,
  reconnectBackoffResets: 0,
  reconnectDelayMsLast: 0,
  reconnectDelayMsMax: 0,
  reconnectAttemptMax: 0,
  socketDisconnected: 0,
  socketClosed: 0,
  getMissedRuns: 0,
  getMissedRetries: 0,
  getMissedSuccess: 0,
  getMissedJoined: 0,
  getAllCalls: 0,
  getAllErrors: 0,
  getAllCode503: 0,
  getAllCode408: 0,
  changefeedCalls: 0,
};

const activeByStorage: CounterByStorage = new Map();
const initByStorage: CounterByStorage = new Map();
const reconnectByStorage: CounterByStorage = new Map();
const getAllByStorage: CounterByStorage = new Map();

function bumpCounterByStorage(
  map: CounterByStorage,
  key: string,
  delta: number = 1,
) {
  if (!key) return;
  const value = (map.get(key) ?? 0) + delta;
  if (value <= 0) {
    map.delete(key);
  } else {
    map.set(key, value);
  }
}

function topCounters(map: CounterByStorage, limit: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([storage, count]) => ({ storage, count }));
}

export function getPersistClientDebugStats({
  topN = 8,
}: { topN?: number } = {}) {
  const top = Math.max(1, topN);
  return {
    ...stats,
    activeByStorageTop: topCounters(activeByStorage, top),
    initByStorageTop: topCounters(initByStorage, top),
    reconnectByStorageTop: topCounters(reconnectByStorage, top),
    getAllByStorageTop: topCounters(getAllByStorage, top),
  };
}

export { type PersistStreamClient };
class PersistStreamClient extends EventEmitter {
  public socket: ConatSocketClient;
  private changefeeds: any[] = [];
  private state: "ready" | "closed" = "ready";
  private lastSeq?: number;
  private reconnecting = false;
  private gettingMissed = false;
  private changesWhenGettingMissed: ChangefeedEvent[] = [];
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stableReconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private recoveryPromise?: Promise<void>;
  private readonly storageKey: string;

  constructor(
    private client: Client,
    private storage: StorageOptions,
    private user: User,
    private service = SERVICE,
  ) {
    super();
    this.setMaxListeners(100);
    this.storageKey = storage.path;
    stats.created += 1;
    stats.active += 1;
    bumpCounterByStorage(activeByStorage, this.storageKey, 1);
    // paths.add(this.storage.path);
    logger.debug("constructor", this.storage);
    this.init();
  }

  private init = () => {
    if (this.client.state == "closed") {
      this.close();
      return;
    }
    if (this.isClosed()) {
      return;
    }
    this.cancelStableReconnectReset();
    this.socket?.close();
    stats.initCalls += 1;
    bumpCounterByStorage(initByStorage, this.storageKey, 1);
    const subject = persistSubject({ ...this.user, service: this.service });
    this.socket = this.client.socket.connect(subject, {
      desc: `persist: ${this.storage.path}`,
      reconnection: false,
      loadBalancer: async (subject: string) =>
        await getPersistServerId({ client: this.client, subject }),
    });
    logger.debug("init", this.storage.path, "connecting to ", subject);
    this.socket.write({
      storage: this.storage,
      changefeed: this.changefeeds.length > 0,
    });
    this.socket.once("ready", this.onSocketReady);

    this.socket.once("disconnected", () => {
      stats.socketDisconnected += 1;
      this.reconnecting = true;
      this.cancelStableReconnectReset();
      this.socket.removeAllListeners();
      this.scheduleReconnect();
    });
    this.socket.once("closed", () => {
      stats.socketClosed += 1;
      this.reconnecting = true;
      this.cancelStableReconnectReset();
      this.socket.removeAllListeners();
      this.scheduleReconnect();
    });

    this.socket.on("data", (updates, headers) => {
      if (updates == null && headers != null) {
        // has to be an error
        this.emit(
          "error",
          new ConatError(headers?.error, { code: headers?.code }),
        );
        this.close();
        return;
      }
      if (this.gettingMissed) {
        this.changesWhenGettingMissed.push(updates);
      } else {
        this.changefeedEmit(updates);
      }
    });
  };

  private onSocketReady = () => {
    this.scheduleStableReconnectReset();
    if (this.reconnecting) {
      void this.getMissed();
    }
  };

  private getMissed = async () => {
    if (this.recoveryPromise != null) {
      stats.getMissedJoined += 1;
      await this.recoveryPromise;
      return;
    }
    this.recoveryPromise = this.getMissed0();
    try {
      await this.recoveryPromise;
    } finally {
      this.recoveryPromise = undefined;
    }
  };

  private getMissed0 = async () => {
    if (this.changefeeds.length == 0 || this.state != "ready") {
      return;
    }
    stats.getMissedRuns += 1;
    let recovered = false;
    try {
      this.gettingMissed = true;
      this.changesWhenGettingMissed.length = 0;

      await until(
        async () => {
          if (this.changefeeds.length == 0 || this.state != "ready") {
            return true;
          }
          try {
            await this.socket.waitUntilReady(DEFAULT_RECOVERY_TIMEOUT);
            if (this.changefeeds.length == 0 || this.state != "ready") {
              return true;
            }
            const resp = await this.socket.request(null, {
              headers: {
                cmd: "changefeed",
              },
              timeout: DEFAULT_RECOVERY_TIMEOUT,
            });
            if (resp.headers?.error) {
              throw new ConatError(`${resp.headers?.error}`, {
                code: resp.headers?.code as string | number,
              });
            }
            if (this.changefeeds.length == 0 || this.state != "ready") {
              return true;
            }
            const updates = await this.getAll({
              start_seq: this.lastSeq,
              timeout: DEFAULT_RECOVERY_TIMEOUT,
            });
            this.changefeedEmit(updates);
            recovered = true;
            return true;
          } catch {
            stats.getMissedRetries += 1;
            return false;
          }
        },
        {
          start: DEFAULT_RECONNECT_DELAY,
          min: Math.min(DEFAULT_RECONNECT_DELAY, 250),
          max: DEFAULT_RECONNECT_DELAY_MAX,
          decay: DEFAULT_RECONNECT_DELAY_DECAY,
        },
      );
    } finally {
      if (this.state != "ready") {
        return;
      }
      if (recovered) {
        this.reconnecting = false;
        stats.getMissedSuccess += 1;
      }
      this.gettingMissed = false;
      for (const updates of this.changesWhenGettingMissed) {
        this.changefeedEmit(updates);
      }
      this.changesWhenGettingMissed.length = 0;
    }
  };

  private changefeedEmit = (updates: ChangefeedEvent) => {
    updates = updates.filter((update) => {
      if (update.op == "delete") {
        return true;
      } else {
        if (update.seq > (this.lastSeq ?? 0)) {
          this.lastSeq = update.seq;
          return true;
        }
      }
      return false;
    });
    if (updates.length == 0) {
      return;
    }
    this.emit("changefeed", updates);
  };

  private isClosed = () => this.state == "closed";

  private scheduleReconnect = () => {
    if (this.state == "closed") {
      return;
    }
    stats.reconnectScheduled += 1;
    bumpCounterByStorage(reconnectByStorage, this.storageKey, 1);
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
    }
    const delay = this.nextReconnectDelay();
    this.reconnectTimer = setTimeout(this.init, delay);
    this.reconnectTimer.unref?.();
  };

  private nextReconnectDelay = () => {
    const base = Math.max(1, DEFAULT_RECONNECT_DELAY);
    const max = Math.max(base, DEFAULT_RECONNECT_DELAY_MAX);
    const decay = Math.max(1, DEFAULT_RECONNECT_DELAY_DECAY);
    const jitter = Math.max(0, DEFAULT_RECONNECT_DELAY_JITTER);
    this.reconnectAttempt += 1;
    stats.reconnectAttemptMax = Math.max(
      stats.reconnectAttemptMax,
      this.reconnectAttempt,
    );
    const raw = Math.min(
      max,
      Math.round(base * decay ** Math.max(0, this.reconnectAttempt - 1)),
    );
    const factor = jitter == 0 ? 1 : 1 + (Math.random() * 2 - 1) * jitter;
    const delay = Math.max(base, Math.round(raw * factor));
    stats.reconnectDelayMsLast = delay;
    stats.reconnectDelayMsMax = Math.max(stats.reconnectDelayMsMax, delay);
    return delay;
  };

  private scheduleStableReconnectReset = () => {
    if (this.reconnectAttempt == 0) {
      return;
    }
    this.cancelStableReconnectReset();
    const attempt = this.reconnectAttempt;
    this.stableReconnectTimer = setTimeout(() => {
      if (
        this.state == "ready" &&
        this.socket?.state == "ready" &&
        this.reconnectAttempt == attempt
      ) {
        this.reconnectAttempt = 0;
        stats.reconnectBackoffResets += 1;
      }
    }, DEFAULT_RECONNECT_STABLE_RESET_MS);
    this.stableReconnectTimer.unref?.();
  };

  private cancelStableReconnectReset = () => {
    if (this.stableReconnectTimer != null) {
      clearTimeout(this.stableReconnectTimer);
      this.stableReconnectTimer = undefined;
    }
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    logger.debug("close", this.storage);
    // paths.delete(this.storage.path);
    this.state = "closed";
    stats.closed += 1;
    stats.active = Math.max(0, stats.active - 1);
    bumpCounterByStorage(activeByStorage, this.storageKey, -1);
    this.emit("closed");
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.cancelStableReconnectReset();
    for (const iter of this.changefeeds) {
      iter.close();
      this.changefeeds.length = 0;
    }
    this.reconnecting = false;
    this.socket.close();
  };

  // The changefeed is *guaranteed* to deliver every message
  // in the stream **exactly once and in order**, even if there
  // are disconnects, failovers, etc.  Dealing with dropped messages,
  // duplicates, etc., is NOT the responsibility of clients.
  changefeed = async (): Promise<Changefeed> => {
    stats.changefeedCalls += 1;
    // activate changefeed mode (so server publishes updates -- this is idempotent)
    const resp = await this.socket.request(null, {
      headers: {
        cmd: "changefeed",
      },
    });
    if (resp.headers?.error) {
      throw new ConatError(`${resp.headers?.error}`, {
        code: resp.headers?.code as string | number,
      });
    }
    // an iterator over any updates that are published.
    const iter = new EventIterator<ChangefeedEvent>(this, "changefeed", {
      map: (args) => args[0],
    });
    this.changefeeds.push(iter);
    return iter;
  };

  set = async ({
    key,
    ttl,
    previousSeq,
    msgID,
    messageData,
    timeout,
  }: SetOptions & { timeout?: number }): Promise<{
    seq: number;
    time: number;
  }> => {
    return this.checkForError(
      await this.socket.request(null, {
        raw: messageData.raw,
        encoding: messageData.encoding,
        headers: {
          headers: messageData.headers,
          cmd: "set",
          key,
          ttl,
          previousSeq,
          msgID,
          timeout,
        },
        timeout,
      }),
    );
  };

  setMany = async (
    ops: SetOptions[],
    { timeout }: { timeout?: number } = {},
  ): Promise<
    ({ seq: number; time: number } | { error: string; code?: any })[]
  > => {
    return this.checkForError(
      await this.socket.request(ops, {
        headers: {
          cmd: "setMany",
          timeout,
        },
        timeout,
      }),
    );
  };

  delete = async ({
    timeout,
    seq,
    seqs,
    last_seq,
    all,
  }: {
    timeout?: number;
    seq?: number;
    seqs?: number[];
    last_seq?: number;
    all?: boolean;
  }): Promise<{ seqs: number[] }> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: {
          cmd: "delete",
          seq,
          seqs,
          last_seq,
          all,
          timeout,
        },
        timeout,
      }),
    );
  };

  config = async ({
    config,
    timeout,
  }: {
    config?: Partial<Configuration>;
    timeout?: number;
  } = {}): Promise<Configuration> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: {
          cmd: "config",
          config,
          timeout,
        } as any,
        timeout,
      }),
    );
  };

  inventory = async (timeout?): Promise<PartialInventory> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: {
          cmd: "inventory",
        } as any,
        timeout,
      }),
    );
  };

  get = async ({
    seq,
    key,
    timeout,
  }: {
    timeout?: number;
  } & (
    | { seq: number; key?: undefined }
    | { key: string; seq?: undefined }
  )): Promise<ConatMessage | undefined> => {
    const resp = await this.socket.request(null, {
      headers: { cmd: "get", seq, key, timeout } as any,
      timeout,
    });
    this.checkForError(resp, true);
    if (resp.headers == null) {
      return undefined;
    }
    return resp;
  };

  // returns async iterator over arrays of stored messages.
  // It's must safer to use getAll below, but less memory
  // efficient.
  async *getAllIter({
    start_seq,
    end_seq,
    timeout,
    maxWait,
  }: GetAllOpts = {}): AsyncGenerator<StoredMessage[], void, unknown> {
    if (this.isClosed()) {
      // done
      return;
    }
    const sub = await this.socket.requestMany(null, {
      headers: {
        cmd: "getAll",
        start_seq,
        end_seq,
        timeout,
      } as any,
      timeout,
      maxWait,
    });
    if (this.isClosed()) {
      // done with this
      return;
    }
    let seq = 0; // next expected seq number for the sub (not the data)
    for await (const { data, headers } of sub) {
      if (headers?.error) {
        throw new ConatError(`${headers.error}`, {
          code: headers.code as string | number,
        });
      }
      if (data == null || this.socket.state == "closed") {
        // done
        return;
      }
      if (typeof headers?.seq != "number" || headers?.seq != seq) {
        throw new ConatError(
          `data dropped, probably due to load -- please try again; expected seq=${seq}, but got ${headers?.seq}`,
          {
            code: 503,
          },
        );
      } else {
        seq = headers?.seq + 1;
      }
      yield data;
    }
  }

  getAll = async (opts: GetAllOpts = {}): Promise<StoredMessage[]> => {
    stats.getAllCalls += 1;
    bumpCounterByStorage(getAllByStorage, this.storageKey, 1);
    // NOTE: We check messages.headers.seq (which has nothing to do with the stream seq numbers!)
    // and make sure it counts from 0 up until done, and that nothing was missed.
    // ONLY once that is done and we have everything do we call processPersistentMessages.
    // Otherwise, just wait and try again from scratch.  There's no socket or
    // any other guarantees that messages aren't dropped since this is requestMany,
    // and under load DEFINITELY messages can be dropped.
    // This throws with code=503 if something goes wrong due to sequence numbers.
    try {
      let messages: StoredMessage[] = [];
      const sub = await this.getAllIter(opts);
      if (this.isClosed()) {
        throw Error("closed");
      }
      for await (const value of sub) {
        messages = messages.concat(value);
      }
      if (this.isClosed()) {
        throw Error("closed");
      }
      return messages;
    } catch (err) {
      stats.getAllErrors += 1;
      const code = (err as any)?.code;
      if (code === 503) {
        stats.getAllCode503 += 1;
      } else if (code === 408) {
        stats.getAllCode408 += 1;
      }
      throw err;
    }
  };

  keys = async ({ timeout }: { timeout?: number } = {}): Promise<string[]> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: { cmd: "keys", timeout } as any,
        timeout,
      }),
    );
  };

  sqlite = async ({
    timeout,
    statement,
    params,
  }: {
    timeout?: number;
    statement: string;
    params?: any[];
  }): Promise<any[]> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: {
          cmd: "sqlite",
          statement,
          params,
        } as any,
        timeout,
      }),
    );
  };

  private checkForError = (mesg, noReturn = false) => {
    if (mesg.headers != null) {
      const { error, code } = mesg.headers;
      if (error || code) {
        throw new ConatError(error ?? "error", { code });
      }
    }
    if (!noReturn) {
      return mesg.data;
    }
  };

  // id of the remote server we're connected to
  serverId = async () => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: { cmd: "serverId" },
      }),
    );
  };
}

export interface SetOptions {
  messageData: MessageData;
  key?: string;
  ttl?: number;
  previousSeq?: number;
  msgID?: string;
  timeout?: number;
}

interface Options {
  client: Client;
  // who is accessing persistent storage
  user: User;
  // what storage they are accessing
  storage: StorageOptions;
  noCache?: boolean;
  service?: string;
}

export const stream = refCacheSync<Options, PersistStreamClient>({
  name: "persistent-stream-client",
  createKey: ({ user, storage, client, service = SERVICE }: Options) => {
    return JSON.stringify([user, storage, client.id, service]);
  },
  createObject: ({ client, user, storage, service = SERVICE }: Options) => {
    // avoid wasting server resources, etc., by always checking permissions client side first
    assertHasWritePermission({ user, storage, service });
    return new PersistStreamClient(client, storage, user, service);
  },
});

let permissionChecks = true;
export function disablePermissionCheck() {
  if (!process.env.COCALC_TEST_MODE) {
    throw Error("disabling permission check only allowed in test mode");
  }
  permissionChecks = false;
}

const assertHasWritePermission = ({ user, storage, service }) => {
  if (!permissionChecks) {
    // should only be used for unit testing, since otherwise would
    // make clients slower and possibly increase server load.
    return;
  }
  const subject = persistSubject({ ...user, service });
  assertHasWritePermission0({ subject, path: storage.path, service });
};
