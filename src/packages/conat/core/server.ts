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

import type { ServerInfo } from "./types";
import {
  matchesPattern,
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/conat/util";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import Valkey from "iovalkey";
import { delay } from "awaiting";
import {
  ConatError,
  connect,
  type Client,
  type ConnectOptions,
} from "./client";

// This is just the default with socket.io, but we might want a bigger
// size, which could mean more RAM usage by the servers.
// Our client protocol automatically chunks messages, so this payload
// size ONLY impacts performance, never application level constraints.
const MB = 1e6;
const MAX_PAYLOAD = 1 * MB;

const MAX_DISCONNECTION_DURATION = 2 * 60 * 1000;

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
  id?: number;
  logger?;
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  valkey?: string;
  maxDisconnectionDuration?: number;
}

export class ConatServer {
  public readonly io;
  public readonly id: number;
  private readonly logger: (...args) => void;
  private interest: { [subject: string]: { [queue: string]: Set<string> } } =
    {};
  private subscriptions: { [socketId: string]: Set<string> } = {};
  private getUser: UserFunction;
  private isAllowed: AllowFunction;
  readonly options: Partial<Options>;
  private readonly valkey?: { adapter: Valkey; pub: Valkey; sub: Valkey };
  private sockets: { [id: string]: any } = {};

  constructor(options: Options) {
    const {
      Server,
      httpServer,
      port = 3000,
      id = 0,
      logger,
      path,
      getUser,
      isAllowed,
      valkey,
      maxDisconnectionDuration = MAX_DISCONNECTION_DURATION,
    } = options;
    this.options = { port, id, path, valkey, maxDisconnectionDuration };
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
      port,
      httpServer: httpServer != null,
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

  close = () => {
    this.io.close();
  };

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
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
    if (op == "add") {
      if (typeof queue != "string") {
        throw Error("queue must not be null for add");
      }
      if (this.interest[subject] == null) {
        this.interest[subject] = { [queue]: new Set([room]) };
      } else if (this.interest[subject][queue] == null) {
        this.interest[subject][queue] = new Set([room]);
      } else {
        this.interest[subject][queue].add(room);
      }
    } else if (op == "delete") {
      const groups = this.interest[subject];
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
          delete this.interest[subject];
        }
      }
    } else {
      throw Error(`invalid op ${op}`);
    }
  };

  private subscribe = async ({ socket, subject, queue, user }) => {
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
      throw new ConatError(`permission denied subscribing to '${subject}'`, {
        code: 403,
      });
    }
    const room = socketSubjectRoom({ socket, subject });
    // critical to await socket.join so we don't advertise that there is 
    // a subscriber before the socket is actually getting messages.
    await socket.join(room); 
    await this.updateInterest({ op: "add", subject, room, queue });
  };

  private publish = async ({ subject, data, from }): Promise<number> => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error("invalid subject");
    }
    if (!(await this.isAllowed({ user: from, subject, type: "pub" }))) {
      throw new ConatError(`permission denied publishing to '${subject}'`, {
        code: 403,
      });
    }
    let count = 0;
    for (const pattern in this.interest) {
      if (!matchesPattern({ pattern, subject })) {
        continue;
      }
      const g = this.interest[pattern];
      if (g === undefined) {
        continue;
      }
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
    socket.on("close", () => delete this.sockets[socket.id]);

    let user: any = null;
    user = await this.getUser(socket);
    const id = socket.id;
    this.log("got connection", { id, user });
    if (this.subscriptions[id] == null) {
      this.subscriptions[id] = new Set<string>();
    }

    socket.emit("info", { ...this.info(), user });

    socket.on("publish", async ([subject, ...data], respond) => {
      try {
        const count = await this.publish({ subject, data, from: user });
        respond?.({ count });
      } catch (err) {
        respond?.({ error: `${err}`, code: err.code });
      }
    });

    socket.on("subscribe", async ({ subject, queue }, respond) => {
      try {
        if (this.subscriptions[id].has(subject)) {
          throw Error(`already subscribed to '${subject}'`);
        }
        await this.subscribe({ socket, subject, queue, user });
        this.subscriptions[id].add(subject);
        respond?.({ status: "added" });
      } catch (err) {
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
      respond?.();
    });

    socket.on("disconnecting", async () => {
      const rooms = Array.from(socket.rooms) as string[];
      const d = this.options.maxDisconnectionDuration ?? 0;
      // console.log(`will unsubscribe in ${d}ms unless client reconnects`);
      await delay(d);
      if (!this.io.of("/").adapter.sids.has(id)) {
        //  console.log("client not back");
        for (const room of rooms) {
          const subject = getSubjectFromRoom(room);
          this.unsubscribe({ socket, subject });
        }
        delete this.subscriptions[id];
      } else {
        // console.log("client is back!");
      }
    });
  };

  // create new client in the same process connected to this server.
  // This is useful for unit testing and is not cached (i.e., multiple
  // calls return distinct clients).
  client = (options?: ConnectOptions): Client => {
    return connect(`http://localhost:${this.options.port}`, {
      path: this.options.path,
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

function randomChoice(v: Set<string>): any {
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
