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

const RECONNECT_DELAY = 1000;

interface GetAllOpts {
  start_seq?: number;
  end_seq?: number;
  timeout?: number;
  maxWait?: number;
}

const logger = getLogger("persist:client");

export type ChangefeedEvent = (SetOperation | DeleteOperation)[];

export type Changefeed = EventIterator<ChangefeedEvent>;

// const paths = new Set<string>();

export { type PersistStreamClient };
class PersistStreamClient extends EventEmitter {
  public socket: ConatSocketClient;
  private changefeeds: any[] = [];
  private state: "ready" | "closed" = "ready";
  private lastSeq?: number;
  private reconnecting = false;
  private gettingMissed = false;
  private changesWhenGettingMissed: ChangefeedEvent[] = [];
  id = Math.random();

  constructor(
    private client: Client,
    private storage: StorageOptions,
    private user: User,
    private service = SERVICE,
  ) {
    super();
    this.setMaxListeners(100);
    // paths.add(this.storage.path);
    logger.debug("constructor", this.storage);
    this.init();
  }

  private init = () => {
    if (this.reconnecting) {
      console.log(
        this.id,
        "persist client reconnecting",
        this.client.id,
        this.storage.path,
      );
    }
    if (this.client.state == "closed") {
      this.close();
      return;
    }
    if (this.isClosed()) {
      return;
    }
    this.socket?.close();
    // console.log("making a socket connection to ", persistSubject(this.user));
    const subject = persistSubject({ ...this.user, service: this.service });
    this.socket = this.client.socket.connect(subject, {
      desc: `persist: ${this.storage.path}`,
      reconnection: false,
    });
    logger.debug("init", this.storage.path, "connecting to ", subject);
    this.socket.write({
      storage: this.storage,
      changefeed: this.changefeeds.length > 0,
    });

    // get any messages from the stream that we missed while offline;
    // this only matters if there are changefeeds.
    if (this.reconnecting) {
      this.getMissed();
    }

    this.socket.once("disconnected", () => {
      // console.log("persist client was disconnected", this.storage.path);
      this.reconnecting = true;
      this.socket.removeAllListeners();
      setTimeout(this.init, RECONNECT_DELAY);
    });
    this.socket.once("closed", () => {
      this.reconnecting = true;
      this.socket.removeAllListeners();
      setTimeout(this.init, RECONNECT_DELAY);
    });

    this.socket.on("data", (updates, headers) => {
      if (this.storage.path.endsWith("foo"))
        console.log(this.id, "data", updates, headers);
      if (updates == null && headers != null) {
        // has to be an error
        this.emit(
          "error",
          new ConatError(headers?.error, { code: headers?.code }),
        );
        this.close();
      }
      if (this.gettingMissed) {
        this.changesWhenGettingMissed.push(updates);
      } else {
        this.changefeedEmit(updates);
      }
    });
  };

  private getMissed = async () => {
    if (this.changefeeds.length == 0 || this.state != "ready") {
      return;
    }
    try {
      this.gettingMissed = true;
      this.changesWhenGettingMissed.length = 0;

      await until(
        async () => {
          if (this.changefeeds.length == 0 || this.state != "ready") {
            return true;
          }
          try {
            await this.socket.waitUntilReady(15000);
            if (this.changefeeds.length == 0 || this.state != "ready") {
              return true;
            }
            const resp = await this.socket.request(null, {
              headers: {
                cmd: "changefeed",
              },
            });
            if (resp.headers?.error) {
              throw new ConatError(`${resp.headers?.error}`, {
                code: resp.headers?.code,
              });
            }
            if (this.changefeeds.length == 0 || this.state != "ready") {
              return true;
            }
            const updates = await this.getAll({
              start_seq: this.lastSeq,
              timeout: 15000,
            });
            this.changefeedEmit(updates);
            return true;
          } catch {
            return false;
          }
        },
        { min: 2000, max: 15000 },
      );
    } finally {
      if (this.state != "ready") {
        return;
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

  close = () => {
    logger.debug("close", this.storage);
    // paths.delete(this.storage.path);
    // console.log("persist -- close", this.storage.path, paths);
    this.state = "closed";
    this.emit("closed");
    for (const iter of this.changefeeds) {
      iter.close();
      this.changefeeds.length = 0;
    }
    this.socket.close();
  };

  // The changefeed is *guaranteed* to deliver every message
  // in the stream **exactly once and in order**, even if there
  // are disconnects, failovers, etc.  Dealing with dropped messages,
  // duplicates, etc., is NOT the responsibility of clients.
  changefeed = async (): Promise<Changefeed> => {
    // activate changefeed mode (so server publishes updates -- this is idempotent)
    const resp = await this.socket.request(null, {
      headers: {
        cmd: "changefeed",
      },
    });
    if (resp.headers?.error) {
      throw new ConatError(`${resp.headers?.error}`, {
        code: resp.headers?.code,
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
    last_seq,
    all,
  }: {
    timeout?: number;
    seq?: number;
    last_seq?: number;
    all?: boolean;
  }): Promise<{ seqs: number[] }> => {
    return this.checkForError(
      await this.socket.request(null, {
        headers: {
          cmd: "delete",
          seq,
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
        throw new ConatError(`${headers.error}`, { code: headers.code });
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
    // NOTE: We check messages.headers.seq (which has nothing to do with the stream seq numbers!)
    // and make sure it counts from 0 up until done, and that nothing was missed.
    // ONLY once that is done and we have everything do we call processPersistentMessages.
    // Otherwise, just wait and try again from scratch.  There's no socket or
    // any other guarantees that messages aren't dropped since this is requestMany,
    // and under load DEFINITELY messages can be dropped.
    // This throws with code=503 if something goes wrong due to sequence numbers.
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
