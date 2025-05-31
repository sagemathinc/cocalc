/*


cd packages/server


   s = await require('@cocalc/server/conat/socketio').initConatServer()

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000})


For clustering:

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({valkey:'redis://localhost:6379', port:3000})

   s1 = await require('@cocalc/server/conat/socketio').initConatServer({valkey:'redis://localhost:6379', port:3001})

Corresponding clients:

   c0 = require('@cocalc/conat/core/client').connect('http://localhost:3000')

   c1 = require('@cocalc/conat/core/client').connect('http://localhost:3001')

---

Or from cocalc/src

   pnpm conat-server

*/

import type { ServerConnectionStats, ServerInfo } from "./types";
import {
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/conat/util";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import Valkey from "iovalkey";
import { delay } from "awaiting";
import { ConatError, connect, type Client, type ClientOptions } from "./client";
import {
  MAX_PAYLOAD,
  MAX_DISCONNECTION_DURATION,
  MAX_SUBSCRIPTIONS_PER_CLIENT,
} from "./constants";
import { randomId } from "@cocalc/conat/names";
import { Patterns } from "./patterns";

const DEBUG = false;

interface InterestUpdate {
  op: "add" | "delete";
  subject: string;
  queue?: string;
  room: string;
}

export function init(opts) {
  return new ConatServer(opts);
}

export type UserFunction = (socket) => Promise<any>;
export type AllowFunction = (opts: {
  type: "pub" | "sub";
  user: any;
  subject: string;
}) => Promise<boolean>;

export interface Options {
  Server;
  httpServer?;
  port?: number;
  id?: string;
  logger?;
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  valkey?: string;
  maxDisconnectionDuration?: number;
  maxSubscriptionsPerClient?: number;
}

export class ConatServer {
  public readonly io;
  public readonly id: string;
  private readonly logger: (...args) => void;
  private interest: Patterns<{ [queue: string]: Set<string> }> = new Patterns();
  private subscriptions: { [socketId: string]: Set<string> } = {};
  private getUser: UserFunction;
  private isAllowed: AllowFunction;
  readonly options: Partial<Options>;
  private readonly valkey?: { adapter: Valkey; pub: Valkey; sub: Valkey };

  private sockets: { [id: string]: any } = {};
  // which subscriptions are ephemeral:
  private ephemeral: { [id: string]: Set<string> } = {};
  private stats: { [id: string]: ServerConnectionStats } = {};
  private disconnectingTimeout: {
    [id: string]: ReturnType<typeof setTimeout>;
  } = {};

  constructor(options: Options) {
    const {
      Server,
      httpServer,
      port = 3000,
      id = randomId(),
      logger,
      path = "/conat",
      getUser,
      isAllowed,
      valkey,
      maxDisconnectionDuration = MAX_DISCONNECTION_DURATION,
      maxSubscriptionsPerClient = MAX_SUBSCRIPTIONS_PER_CLIENT,
    } = options;
    this.options = {
      port,
      id,
      path,
      valkey,
      maxDisconnectionDuration,
      maxSubscriptionsPerClient,
    };
    this.getUser = getUser ?? (async () => null);
    this.isAllowed = isAllowed ?? (async () => true);
    this.id = id;
    this.logger = logger;
    if (valkey) {
      this.log("Using Valkey for clustering");
      this.valkey = {
        adapter: new Valkey(valkey),
        pub: new Valkey(valkey),
        sub: new Valkey(valkey),
      };
    }
    this.log("Starting Conat server...", {
      id,
      path,
      port: httpServer ? undefined : port,
      httpServer: httpServer ? "httpServer(...)" : undefined,
      valkey,
    });
    const socketioOptions = {
      maxHttpBufferSize: MAX_PAYLOAD,
      path,
      adapter:
        this.valkey != null ? createAdapter(this.valkey.adapter) : undefined,
      connectionStateRecovery: { maxDisconnectionDuration },
      // perMessageDeflate is disabled by default in socket.io due to FUD -- see https://github.com/socketio/socket.io/issues/3477#issuecomment-930503313
      perMessageDeflate: { threshold: 1024 },
    };
    this.log(socketioOptions);
    if (httpServer) {
      this.io = new Server(httpServer, socketioOptions);
    } else {
      this.io = new Server(port, socketioOptions);
      this.log(`listening on port ${port}`);
    }
    this.init();
  }

  private init = () => {
    this.io.on("connection", this.handleSocket);
    if (this.valkey != null) {
      this.initInterestSubscription();
    }
  };

  close = async () => {
    await this.io.close();
    for (const prop of ["interest", "subscriptions", "sockets", "services"]) {
      delete this[prop];
    }
  };

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
      id: this.id,
    };
  };

  private log = (...args) => {
    this.logger?.(new Date().toISOString(), "conat", this.id, ":", ...args);
  };

  private unsubscribe = async ({ socket, subject }) => {
    if (DEBUG) {
      this.log("unsubscribe ", { id: socket.id, subject });
    }
    const room = socketSubjectRoom({ socket, subject });
    socket.leave(room);
    (this.ephemeral[socket.id] ?? new Set<string>()).delete(subject);
    await this.updateInterest({ op: "delete", subject, room });
  };

  private initInterestSubscription = async () => {
    if (this.valkey == null) {
      throw Error("valkey not defined");
    }
    // [ ] TODO: we need to limit the size of the stream and/or
    // timeeout interest and/or reconcile it periodically with
    // actual connected users to avoid the interest object
    // getting too big for now reason.  E.g, maybe all subscriptions
    // need to be renewed periodically
    let lastId = "0";
    let d = 50;
    while (true) {
      // console.log("waiting for interest update");
      const results = await this.valkey.sub.xread(
        "block" as any,
        0,
        "STREAMS",
        "interest",
        lastId,
      );
      // console.log("got ", results);
      if (results == null) {
        d = Math.min(1000, d * 1.2);
        await delay(d);
        continue;
      } else {
        d = 50;
      }
      const [_, messages] = results[0];
      for (const message of messages) {
        const update = JSON.parse(message[1][1]);
        this._updateInterest(update);
      }
      lastId = messages[messages.length - 1][0];
      // console.log({ lastId });
    }
  };

  private updateInterest = async (update: InterestUpdate) => {
    if (this.valkey != null) {
      // publish interest change to valkey.
      await this.valkey.pub.xadd(
        "interest",
        "*",
        "update",
        JSON.stringify(update),
      );
    }
    this._updateInterest(update);
  };

  private _updateInterest = async ({
    op,
    subject,
    queue,
    room,
  }: InterestUpdate) => {
    const groups = this.interest.get(subject);
    if (op == "add") {
      if (typeof queue != "string") {
        throw Error("queue must not be null for add");
      }
      if (groups === undefined) {
        this.interest.set(subject, { [queue]: new Set([room]) });
      } else if (groups[queue] == null) {
        groups[queue] = new Set([room]);
      } else {
        groups[queue].add(room);
      }
    } else if (op == "delete") {
      if (groups != null) {
        let nonempty = false;
        for (const queue in groups) {
          groups[queue].delete(room);
          if (groups[queue].size == 0) {
            delete groups[queue];
          } else {
            nonempty = true;
          }
        }
        if (!nonempty) {
          // no interest anymore
          this.interest.delete(subject);
        }
      }
    } else {
      throw Error(`invalid op ${op}`);
    }
  };

  private subscribe = async ({ socket, subject, queue, ephemeral, user }) => {
    if (DEBUG) {
      this.log("subscribe ", { id: socket.id, subject, queue });
    }
    if (typeof queue != "string") {
      throw Error("queue must be defined");
    }
    if (!isValidSubject(subject)) {
      throw Error("invalid subject");
      return;
    }
    if (!(await this.isAllowed({ user, subject, type: "sub" }))) {
      const message = `permission denied subscribing to '${subject}' from ${JSON.stringify(user)}`;
      this.log(message);
      throw new ConatError(message, {
        code: 403,
      });
    }
    const maxSubs = this.options.maxSubscriptionsPerClient ?? 0;
    if (maxSubs) {
      const numSubs = this.subscriptions?.[socket.id]?.size ?? 0;
      if (numSubs >= maxSubs) {
        // error 429 == "too many requests"
        throw new ConatError(
          `there is a limit of at most ${maxSubs} subscriptions and you currently have ${numSubs} subscriptions`,
          { code: 429 },
        );
      }
    }
    const room = socketSubjectRoom({ socket, subject });
    // critical to await socket.join so we don't advertise that there is
    // a subscriber before the socket is actually getting messages.
    await socket.join(room);
    await this.updateInterest({ op: "add", subject, room, queue });
    if (this.ephemeral[socket.id] === undefined) {
      this.ephemeral[socket.id] = new Set<string>();
    }
    if (ephemeral) {
      this.ephemeral[socket.id].add(subject);
    } else {
      this.ephemeral[socket.id].delete(subject);
    }
  };

  private publish = async ({ subject, data, from }): Promise<number> => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error("invalid subject");
    }
    if (!(await this.isAllowed({ user: from, subject, type: "pub" }))) {
      const message = `permission denied publishing to '${subject}' from ${JSON.stringify(from)}`;
      this.log(message);
      throw new ConatError(message, {
        // this is the http code for permission denied, and having this
        // set is assumed elsewhere in our code, so don't mess with it!
        code: 403,
      });
    }
    let count = 0;
    for (const pattern of this.interest.matches(subject)) {
      const g = this.interest.get(pattern)!;
      if (DEBUG) {
        this.log("publishing", { subject, data, g });
      }
      // send to exactly one in each queue group
      for (const queue in g) {
        const choice = randomChoice(g[queue]);
        if (choice !== undefined) {
          this.io.to(choice).emit(pattern, { subject, data });
          count += 1;
        }
      }
    }
    return count;
  };

  private handleSocket = async (socket) => {
    this.sockets[socket.id] = socket;
    socket.on("close", () => {
      delete this.sockets[socket.id];
      delete this.stats[socket.id];
    });

    this.stats[socket.id] = {
      send: { messages: 0, bytes: 0 },
      subs: 0,
    };
    let user: any = null;
    try {
      user = await this.getUser(socket);
    } catch (err) {
      // getUser is supposed to throw an error if authentication fails
      // for any reason
      user = { error: `${err}` };
    }
    this.stats[socket.id].user = user;
    const id = socket.id;
    this.log("new connection", { id, user });
    if (this.disconnectingTimeout[id]) {
      this.log("clearing disconnectingTimeout - ", { id, user });
      clearTimeout(this.disconnectingTimeout[id]);
      delete this.disconnectingTimeout[id];
    }
    if (this.subscriptions[id] == null) {
      this.subscriptions[id] = new Set<string>();
    }

    socket.emit("info", { ...this.info(), user });

    socket.on("publish", async ([subject, ...data], respond) => {
      if (data?.[2]) {
        // done
        this.stats[socket.id].send.messages += 1;
      }
      this.stats[socket.id].send.bytes += data[4]?.length ?? 0;
      // this.log(JSON.stringify(this.stats));

      try {
        const count = await this.publish({ subject, data, from: user });
        respond?.({ count });
      } catch (err) {
        if (err.code == 403) {
          socket.emit("permission", {
            message: err.message,
            subject,
            type: "pub",
          });
        }
        respond?.({ error: `${err}`, code: err.code });
      }
    });

    socket.on("subscribe", async ({ subject, queue, ephemeral }, respond) => {
      try {
        if (this.subscriptions[id].has(subject)) {
          throw Error(`already subscribed to '${subject}'`);
        }
        await this.subscribe({ socket, subject, queue, user, ephemeral });
        this.subscriptions[id].add(subject);
        this.stats[socket.id].subs += 1;
        respond?.({ status: "added" });
      } catch (err) {
        if (err.code == 403) {
          socket.emit("permission", {
            message: err.message,
            subject,
            type: "sub",
          });
        }
        respond?.({ error: `${err}`, code: err.code });
      }
    });

    socket.on("subscriptions", (_, respond) => {
      if (respond == null) {
        return;
      }
      respond(Array.from(this.subscriptions[id]));
    });

    socket.on("unsubscribe", ({ subject }, respond) => {
      if (!this.subscriptions[id].has(subject)) {
        return;
      }
      this.unsubscribe({ socket, subject });
      this.subscriptions[id].delete(subject);
      this.stats[socket.id].subs -= 1;
      respond?.();
    });

    socket.on("disconnecting", async () => {
      this.log("disconnecting", { id, user });
      for (const subject of this.ephemeral[socket.id] ?? []) {
        this.unsubscribe({ socket, subject });
        this.subscriptions[id].delete(subject);
      }
      const rooms = Array.from(socket.rooms) as string[];
      if (this.disconnectingTimeout[id]) {
        clearTimeout(this.disconnectingTimeout[id]);
      }
      this.log("setting a new disconnectingTimeout - ", { id, user });
      this.disconnectingTimeout[id] = setTimeout(
        () => {
          this.log("firing disconnectingTimeout - ", { id, user });
          if (!this.io.of("/").adapter.sids.has(id)) {
            // User is gone right now and did NOT reconnect (thus clearning disconnectingTimeout)
            // during the wait interval.  Clear their subscription state.
            // It's very important to ONLY do this if they are really gone, since if they
            // come back, socketio smooths things over, so they don't even know they might need
            // to resubscribe... or they already did resubscribe, and we would just be breaking
            // things for them.
            this.log("disconnecting - fully gone", { id, user });
            for (const room of rooms) {
              const subject = getSubjectFromRoom(room);
              this.unsubscribe({ socket, subject });
            }
            delete this.subscriptions[id];
          } else {
            this.log("disconnecting - came back", { id, user });
          }
        },
        (this.options.maxDisconnectionDuration ?? 0) + 10000,
      );
    });
  };

  // create new client in the same process connected to this server.
  // This is useful for unit testing and is not cached by default (i.e., multiple
  // calls return distinct clients).
  client = (options?: ClientOptions): Client => {
    const path = this.options.path?.slice(-"/conat".length) ?? "";
    return connect({
      address: `http://localhost:${this.options.port}${path}`,
      noCache: true,
      ...options,
    });
  };
}

function getSubjectFromRoom(room: string) {
  if (room.startsWith("{")) {
    return JSON.parse(room).subject;
  } else {
    return room;
  }
}

function socketSubjectRoom({ socket, subject }) {
  return JSON.stringify({ id: socket.id, subject });
}

export function randomChoice(v: Set<string>): any {
  if (v.size == 0) {
    return undefined;
  }
  if (v.size == 1) {
    for (const x of v) {
      return x;
    }
  }
  const w = Array.from(v);
  const i = Math.floor(Math.random() * w.length);
  return w[i];
}
