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
import { persistSubject, type User } from "./util";
import { assertHasWritePermission as assertHasWritePermission0 } from "./auth";
import { refCacheSync } from "@cocalc/util/refcache";
import { EventEmitter } from "events";
import { getLogger } from "@cocalc/conat/client";
import { delay } from "awaiting";

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

  constructor(
    private client: Client,
    private storage: StorageOptions,
    private user: User,
  ) {
    super();
    // paths.add(this.storage.path);
    logger.debug("constructor", this.storage);
    this.init();
  }

  private init = () => {
    if (this.client.state == "closed") {
      this.close();
      return;
    }
    if (this.state == "closed") {
      return;
    }
    this.socket?.close();
    // console.log("making a socket connection to ", persistSubject(this.user));
    this.socket = this.client.socket.connect(persistSubject(this.user), {
      desc: `persist: ${this.storage.path}`,
      reconnection: false,
    });
    logger.debug(
      "init",
      this.storage.path,
      "connecting to ",
      persistSubject(this.user),
    );
    //     console.log(
    //       "persist -- create",
    //       this.storage.path,
    //       paths,
    //       "with id=",
    //       this.socket.id,
    //     );
    this.socket.write({
      storage: this.storage,
      changefeed: this.changefeeds.length > 0,
    });

    // get any messages from the stream that we missed while offline.
    if (this.reconnecting) {
      this.getMissed();
    }

    this.socket.once("disconnected", () => {
      this.reconnecting = true;
      this.socket.removeAllListeners();
      setTimeout(this.init, 1000);
    });
    this.socket.once("closed", () => {
      this.reconnecting = true;
      this.socket.removeAllListeners();
      setTimeout(this.init, 1000);
    });

    this.socket.on("data", (updates, headers) => {
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
        const seq = updates[updates.length - 1].seq;
        this.lastSeq = seq;
        this.emit("changefeed", updates);
      }
    });
  };

  private getMissed = async () => {
    try {
      this.gettingMissed = true;
      this.changesWhenGettingMissed.length = 0;
      while (this.state == "ready") {
        try {
          await this.socket.waitUntilReady(90000);
          break;
        } catch {
          // timeout
          await delay(1000);
        }
      }
      //     console.log("getMissed", {
      //       path: this.storage.path,
      //       lastSeq: this.lastSeq,
      //       changefeeds: this.changefeeds.length,
      //     });
      if (this.changefeeds.length == 0) {
        return;
      }
      // we are resuming after a disconnect when we had some data up to lastSeq.
      // let's grab anything we missed.
      const sub = await this.socket.requestMany(null, {
        headers: {
          cmd: "getAll",
          start_seq: this.lastSeq,
          timeout: 15000,
        } as any,
        timeout: 15000,
        maxWait: 15000,
      });
      for await (const { data: updates, headers } of sub) {
        if (headers?.error) {
          // give up
          return;
        }
        if (updates == null || this.socket.state == "closed") {
          // done
          return;
        }
        const seq = updates[updates.length - 1].seq;
        this.lastSeq = Math.max(this.lastSeq ?? 0, seq);
        this.emit("changefeed", updates);
      }
    } finally {
      this.gettingMissed = false;
      const updatesWhileGettingMissed: ChangefeedEvent = [];
      for (const updates of this.changesWhenGettingMissed) {
        for (const update of updates) {
          if (update.op == "delete") {
            updatesWhileGettingMissed.push(update);
          } else if (update.seq > (this.lastSeq ?? 0)) {
            updatesWhileGettingMissed.push(update);
            this.lastSeq = update.seq;
          }
        }
      }
      if (updatesWhileGettingMissed.length > 0) {
        this.emit("changefeed", updatesWhileGettingMissed);
      }
      this.changesWhenGettingMissed.length = 0;
    }
  };

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

  // The changefeed is **NOT** guaranteed to deliver every message
  // in the stream exactly once and in order. It tries, but there
  // are cases involving disconnects, etc., where it could be out
  // of order or something could be missed, or there might be a
  // duplicate.  The stream elements themselves have seq numbers
  // that can be helpful.
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

  // returns async iterator over arrays of stored messages
  async *getAll({
    start_seq,
    end_seq,
    timeout,
    maxWait,
  }: {
    start_seq?: number;
    end_seq?: number;
    timeout?: number;
    maxWait?: number;
  } = {}): AsyncGenerator<StoredMessage[], void, unknown> {
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
    for await (const { data, headers } of sub) {
      if (headers?.error) {
        throw new ConatError(`${headers.error}`, { code: headers.code });
      }
      if (data == null || this.socket.state == "closed") {
        // done
        return;
      }
      yield data;
    }
  }

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
}

export const stream = refCacheSync<Options, PersistStreamClient>({
  name: "persistent-stream-client",
  createKey: ({ user, storage, client }: Options) => {
    return JSON.stringify([user, storage, client.id]);
  },
  createObject: ({ client, user, storage }: Options) => {
    // avoid wasting server resources, etc., by always checking permissions client side first
    assertHasWritePermission({ user, storage });
    return new PersistStreamClient(client, storage, user);
  },
});

let permissionChecks = true;
export function disablePermissionCheck() {
  if (!process.env.COCALC_TEST_MODE) {
    throw Error("disabling permission check only allowed in test mode");
  }
  permissionChecks = false;
}

const assertHasWritePermission = ({ user, storage }) => {
  if (!permissionChecks) {
    // should only be used for unit testing, since otherwise would
    // make clients slower and possibly increase server load.
    return;
  }
  const subject = persistSubject(user);
  assertHasWritePermission0({ subject, path: storage.path });
};
