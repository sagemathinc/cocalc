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
} from "./storage";
export { StoredMessage, StorageOptions };
import { persistSubject, type User } from "./util";
import { assertHasWritePermission as assertHasWritePermission0 } from "./auth";
import { refCacheSync } from "@cocalc/util/refcache";
import { EventEmitter } from "events";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("persist:client");

export interface ChangefeedEvent {
  updates: (SetOperation | DeleteOperation)[];
  seq: number;
}

export type Changefeed = EventIterator<ChangefeedEvent>;

export class PersistStreamClient extends EventEmitter {
  public socket: ConatSocketClient;
  private changefeeds: any[] = [];
  private state: "ready" | "closed" = "ready";

  constructor(
    private client: Client,
    private storage: StorageOptions,
    private user: User,
  ) {
    super();
    logger.debug("constructor", this.storage);
    this.init();
  }

  private init = () => {
    if (this.state == "closed") {
      return;
    }
    this.socket?.close();
    logger.debug(
      "init",
      this.storage,
      "connecting to ",
      persistSubject(this.user),
    );
    this.socket = this.client.socket.connect(persistSubject(this.user), {
      reconnection: false,
    });
    this.socket.write({
      storage: this.storage,
      changefeed: this.changefeeds.length > 0,
    });
    this.socket.once("disconnected", () => {
      this.socket.removeListener("closed", this.init);
      this.init();
    });
    this.socket.once("closed", this.init);
    this.socket.on("data", (updates, headers) => {
      this.emit("changefeed", { updates, seq: headers?.seq });
    });
  };

  close = () => {
    // console.log("PersistStreamClient.close", this.storage);
    this.state = "closed";
    for (const iter of this.changefeeds) {
      iter.close();
      this.changefeeds.length = 0;
    }
    this.socket.close();
  };

  changefeed = async (): Promise<Changefeed> => {
    // activate changefeed mode (so server publishes updates -- this is idempotent)
    const resp = await this.socket.request(null, {
      headers: {
        cmd: "changefeed",
      },
    });
    if (resp.headers?.error) {
      throw Error(`${resp.headers?.error}`);
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
