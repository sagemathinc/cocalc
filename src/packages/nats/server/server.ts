/*


cd packages/server


   s = await require('@cocalc/server/nats/socketio').initConatServer()
    
Or from cocalc/src

   pnpm conat-server
   
*/

import type { ServerInfo } from "./types";
import {
  matchesPattern,
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/nats/util";
import { randomId } from "@cocalc/nats/names";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import Valkey from "iovalkey";

// This is just the default with socket.io, but we might want a bigger
// size, which could mean more RAM usage by the servers.
// Our client protocol automatically chunks messages, so this payload
// size ONLY impacts performance, never application level constraints.
const MB = 1e6;
const MAX_PAYLOAD = 1 * MB;

const DEBUG = false;

export function init(opts) {
  return new ConatServer(opts);
}

export type UserFunction = (socket) => Promise<any>;
export type AllowFunction = (opts: {
  type: "pub" | "sub";
  user: any;
  subject: string;
}) => Promise<boolean>;

interface Options {
  Server;
  httpServer?;
  port?: number;
  id?: number;
  logger?;
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  valkey?: string;
  adapter?;
}

export class ConatServer {
  public readonly io;
  public readonly id: number;
  private readonly logger: (...args) => void;
  private queueGroups: { [subject: string]: { [queue: string]: Set<string> } } =
    {};
  private getUser: UserFunction;
  private isAllowed: AllowFunction;
  readonly options: Options;
  private valkey?: Valkey;

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
      adapter,
    } = options;
    this.options = options;
    this.getUser = getUser ?? (async () => null);
    this.isAllowed = isAllowed ?? (async () => true);
    this.id = id;
    this.logger = logger;
    if (valkey) {
      this.log("Using Valkey for clustering");
      this.valkey = new Valkey(valkey);
    }
    this.log("Starting CoNat server...", {
      id,
      path,
      port,
      httpServer: httpServer != null,
      valkey,
    });
    const socketioOptions = {
      maxHttpBufferSize: MAX_PAYLOAD,
      path,
      adapter: this.valkey != null ? createAdapter(this.valkey) : adapter,
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

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
    };
  };

  private log = (...args) => {
    this.logger?.(new Date().toISOString(), "conat", this.id, ":", ...args);
  };

  private unsubscribe = ({ socket, subject }) => {
    if (DEBUG) {
      this.log("unsubscribe ", { id: socket.id, subject });
    }
    socket.leave(subject);
    const groups = this.queueGroups[subject];
    if (groups != null) {
      const socketSubject = socketSpecificSubject({ socket, subject });
      for (const queue in groups) {
        groups[queue].delete(socketSubject);
        if (groups[queue].size == 0) {
          delete groups[queue];
        }
      }
    }
  };

  private subscribe = async ({ socket, subject, queue, user }) => {
    if (DEBUG) {
      this.log("subscribe ", { id: socket.id, subject, queue });
    }
    if (!queue) {
      queue = randomId();
    }
    if (!isValidSubject(subject)) {
      throw Error("invalid subject");
      return;
    }
    if (!(await this.isAllowed({ user, subject, type: "sub" }))) {
      throw Error("permission denied");
    }
    const socketSubject = socketSpecificSubject({ socket, subject });
    if (this.queueGroups[subject] == null) {
      this.queueGroups[subject] = { [queue]: new Set([socketSubject]) };
    } else if (this.queueGroups[subject][queue] == null) {
      this.queueGroups[subject][queue] = new Set([socketSubject]);
    } else {
      this.queueGroups[subject][queue].add(socketSubject);
    }
    socket.join(socketSubject);
  };

  private publish = async ({ subject, data, from }) => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error("invalid subject");
    }
    if (!(await this.isAllowed({ user: from, subject, type: "pub" }))) {
      throw Error("permission denied");
    }
    for (const pattern in this.queueGroups) {
      if (!matchesPattern({ pattern, subject })) {
        continue;
      }
      const g = this.queueGroups[pattern];
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
          this.io.to(choice).emit(pattern, { subject, data, from });
        }
      }
    }
  };

  private init = () => {
    this.io.on("connection", this.handleSocket);
  };

  private handleSocket = async (socket) => {
    let user: any = null;
    user = await this.getUser(socket);
    this.log("got connection", { id: socket.id, user });
    const subscriptions = new Set<string>();

    socket.emit("info", { ...this.info(), user });

    socket.on("publish", async ([subject, ...data], respond) => {
      try {
        await this.publish({ subject, data, from: user });
        respond?.();
      } catch (err) {
        respond?.({ error: `${err}` });
      }
    });

    socket.on("subscribe", async ({ subject, queue }, respond) => {
      try {
        if (!subscriptions.has(subject)) {
          await this.subscribe({ socket, subject, queue, user });
          subscriptions.add(subject);
        }
        respond?.({ status: "added" });
      } catch (err) {
        console.log("subscribe error respnod", err);
        respond?.({ error: `${err}` });
      }
    });

    socket.on("subscriptions", (_, respond) => {
      if (respond == null) {
        return;
      }
      respond(Array.from(subscriptions));
    });

    socket.on("unsubscribe", ({ subject }, respond) => {
      if (!subscriptions.has(subject)) {
        return;
      }
      this.unsubscribe({ socket, subject });
      subscriptions.delete(subject);
      respond?.();
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        const subject = getRoomSubject(room);
        this.unsubscribe({ socket, subject });
      }
      subscriptions.clear();
    });
  };
}

function getRoomSubject(room: string) {
  if (room.startsWith("{")) {
    return JSON.parse(room).subject;
  } else {
    return room;
  }
}

function socketSpecificSubject({ socket, subject }) {
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
