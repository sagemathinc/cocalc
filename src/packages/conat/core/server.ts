/*


cd packages/server


   s = await require('@cocalc/server/conat/socketio').initConatServer()

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0


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
import { Server } from "socket.io";
import { delay } from "awaiting";
import {
  ConatError,
  connect,
  type Client,
  type ClientOptions,
  STICKY_QUEUE_GROUP,
} from "./client";
import {
  RESOURCE,
  MAX_CONNECTIONS_PER_USER,
  MAX_CONNECTIONS,
  MAX_PAYLOAD,
  MAX_SUBSCRIPTIONS_PER_CLIENT,
  MAX_SUBSCRIPTIONS_PER_HUB,
} from "./constants";
import { randomId } from "@cocalc/conat/names";
import { Patterns } from "./patterns";
import ConsistentHash from "consistent-hash";
import { is_array } from "@cocalc/util/misc";
import { UsageMonitor } from "@cocalc/conat/monitor/usage";

const DEBUG = false;

interface InterestUpdate {
  op: "add" | "delete";
  subject: string;
  queue?: string;
  room: string;
}

export function init(opts: Options) {
  return new ConatServer(opts);
}

export type UserFunction = (
  socket,
  systemAccounts?: { [cookieName: string]: { password: string; user: any } },
) => Promise<any>;

export type AllowFunction = (opts: {
  type: "pub" | "sub";
  user: any;
  subject: string;
}) => Promise<boolean>;

export interface Options {
  httpServer?;
  port?: number;
  id?: string;
  logger?;
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  valkey?: string;
  maxSubscriptionsPerClient?: number;
  maxSubscriptionsPerHub?: number;
  systemAccountPassword?: string;
  // if true, use https when creating an internal client.
  ssl?: boolean;
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
  private disconnectingTimeout: {
    [id: string]: ReturnType<typeof setTimeout>;
  } = {};

  private stats: { [id: string]: ServerConnectionStats } = {};
  private usage: UsageMonitor;

  constructor(options: Options) {
    const {
      httpServer,
      port = 3000,
      ssl = false,
      id = randomId(),
      logger,
      path = "/conat",
      getUser,
      isAllowed,
      valkey,
      maxSubscriptionsPerClient = MAX_SUBSCRIPTIONS_PER_CLIENT,
      maxSubscriptionsPerHub = MAX_SUBSCRIPTIONS_PER_HUB,
      systemAccountPassword,
    } = options;
    this.options = {
      port,
      ssl,
      id,
      path,
      valkey,
      maxSubscriptionsPerClient,
      maxSubscriptionsPerHub,
      systemAccountPassword,
    };
    this.getUser = async (socket) => {
      if (getUser == null) {
        // no auth at all
        return null;
      } else {
        let systemAccounts;
        if (this.options.systemAccountPassword) {
          systemAccounts = {
            sys: {
              password: this.options.systemAccountPassword,
              user: { hub_id: "system" },
            },
          };
        } else {
          systemAccounts = undefined;
        }
        return await getUser(socket, systemAccounts);
      }
    };
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
      port: this.options.port,
      httpServer: httpServer ? "httpServer(...)" : undefined,
      valkey,
    });
    // NOTE: do NOT enable connectionStateRecovery; it seems to cause issues
    // when restarting the server.
    const socketioOptions = {
      maxHttpBufferSize: MAX_PAYLOAD,
      path,
      adapter:
        this.valkey != null ? createAdapter(this.valkey.adapter) : undefined,
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
    this.initUsage();
    this.init();
    if (this.options.systemAccountPassword) {
      this.initSystemService();
    }
  }

  private init = () => {
    this.io.on("connection", this.handleSocket);
    if (this.valkey != null) {
      this.initInterestSubscription();
      this.initStickySubscription();
    }
  };

  private initUsage = () => {
    this.usage = new UsageMonitor({
      maxPerUser: MAX_CONNECTIONS_PER_USER,
      max: MAX_CONNECTIONS,
      resource: RESOURCE,
      log: (...args) => this.log("usage", ...args),
    });
  };

  close = async () => {
    await this.io.close();
    for (const prop of ["interest", "subscriptions", "sockets", "services"]) {
      delete this[prop];
    }
    this.usage?.close();
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
    await this.updateInterest({ op: "delete", subject, room });
  };

  private initInterestSubscription = async () => {
    if (this.valkey == null) {
      throw Error("valkey not defined");
    }
    // [ ] TODO: we need to limit the size of the stream and/or
    // timeout interest and/or reconcile it periodically with
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

  private initStickySubscription = async () => {
    if (this.valkey == null) {
      throw Error("valkey not defined");
    }
    let lastId = "0";
    let d = 50;
    while (true) {
      const results = await this.valkey.sub.xread(
        "block" as any,
        0,
        "STREAMS",
        "sticky",
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
        this._updateSticky(update);
      }
      lastId = messages[messages.length - 1][0];
      // console.log({ lastId });
    }
  };

  private updateInterest = async (update: InterestUpdate) => {
    this._updateInterest(update);
    if (this.valkey != null) {
      // publish interest change to valkey.
      await this.valkey.pub.xadd(
        "interest",
        "*",
        "update",
        JSON.stringify(update),
      );
    }
  };

  private _updateInterest = ({ op, subject, queue, room }: InterestUpdate) => {
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
          delete this.sticky[subject];
        }
      }
    } else {
      throw Error(`invalid op ${op}`);
    }
  };

  private updateSticky = async (update: {
    pattern: string;
    subject: string;
    target: string;
  }) => {
    this._updateSticky(update);
    if (this.valkey != null) {
      // publish interest change to valkey.
      await this.valkey.pub.xadd(
        "sticky",
        "*",
        "update",
        JSON.stringify(update),
      );
    }
  };

  private getStickyTarget = ({ pattern, subject }) => {
    return this.sticky[pattern]?.[subject];
  };

  private _updateSticky = ({
    pattern,
    subject,
    target,
  }: {
    pattern: string;
    subject: string;
    target: string;
  }) => {
    if (this.sticky[pattern] === undefined) {
      this.sticky[pattern] = {};
    }
    this.sticky[pattern][subject] = target;
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
      const message = `permission denied subscribing to '${subject}' from ${JSON.stringify(user)}`;
      this.log(message);
      throw new ConatError(message, {
        code: 403,
      });
    }
    let maxSubs;
    if (user?.hub_id) {
      maxSubs =
        this.options.maxSubscriptionsPerHub ?? MAX_SUBSCRIPTIONS_PER_HUB;
    } else {
      maxSubs =
        this.options.maxSubscriptionsPerClient ?? MAX_SUBSCRIPTIONS_PER_CLIENT;
    }
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
        const target = this.loadBalance({
          pattern,
          subject,
          queue,
          targets: g[queue],
        });
        if (target !== undefined) {
          this.io.to(target).emit(pattern, { subject, data });
          count += 1;
        }
      }
    }
    return count;
  };

  private sticky: { [subject: string]: any } = {};
  private loadBalance = ({
    pattern,
    subject,
    queue,
    targets,
  }: {
    pattern: string;
    subject: string;
    queue: string;
    targets: Set<string>;
  }): string | undefined => {
    if (targets.size == 0) {
      return undefined;
    }
    if (queue == STICKY_QUEUE_GROUP) {
      const currentTarget = this.getStickyTarget({ pattern, subject });
      if (currentTarget === undefined || !targets.has(currentTarget)) {
        // we use consistent hashing instead of random to make the choice, because if
        // choice is being made by two different socketio servers at the same time,
        // and they make different choices, it would be (temporarily) bad since a
        // couple messages could get routed inconsistently (valkey sync would quickly
        // resolve this).  It's actually very highly likely to have such parallel choices
        // happening in cocalc, since when a file is opened a persistent stream is opened
        // in the browser and the project at the exact same time, and those are likely
        // to be connected to different socketio servers.  By using consistent hashing,
        // all conflicts are avoided except for a few moments when the actual targets
        // (e.g., the persist servers) are themselves changing, which should be something
        // that only happens for a moment every few days.
        const target = consistentChoice(targets, subject);
        this.updateSticky({ pattern, subject, target });
        return target;
      }
      return currentTarget;
    } else {
      return randomChoice(targets);
    }
  };

  private handleSocket = async (socket) => {
    this.sockets[socket.id] = socket;
    socket.once("closed", () => {
      delete this.sockets[socket.id];
      delete this.stats[socket.id];
    });

    this.stats[socket.id] = {
      send: { messages: 0, bytes: 0 },
      subs: 0,
      connected: Date.now(),
      address: getAddress(socket),
    };
    let user: any = null;
    let added = false;
    try {
      user = await this.getUser(socket);
      this.usage.add(user);
      added = true;
    } catch (err) {
      // getUser is supposed to throw an error if authentication fails
      // for any reason
      // Also, if the connection limit is hit they still connect, but as
      // the error user who can't do anything (hence not waste resources).
      user = { error: `${err}`, code: err.code };
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
      this.stats[socket.id].active = Date.now();
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

    const subscribe = async ({ subject, queue }) => {
      try {
        if (this.subscriptions[id].has(subject)) {
          return { status: "already-added" };
        }
        await this.subscribe({ socket, subject, queue, user });
        this.subscriptions[id].add(subject);
        this.stats[socket.id].subs += 1;
        this.stats[socket.id].active = Date.now();
        return { status: "added" };
      } catch (err) {
        if (err.code == 403) {
          socket.emit("permission", {
            message: err.message,
            subject,
            type: "sub",
          });
        }
        return { error: `${err}`, code: err.code };
      }
    };

    socket.on(
      "subscribe",
      async (x: { subject; queue } | { subject; queue }[], respond) => {
        let r;
        if (is_array(x)) {
          const v: any[] = [];
          for (const y of x) {
            v.push(await subscribe(y));
          }
          r = v;
        } else {
          r = await subscribe(x);
        }
        respond?.(r);
      },
    );

    socket.on("subscriptions", (_, respond) => {
      if (respond == null) {
        return;
      }
      respond(Array.from(this.subscriptions[id]));
    });

    const unsubscribe = ({ subject }: { subject: string }) => {
      if (!this.subscriptions[id].has(subject)) {
        return;
      }
      this.unsubscribe({ socket, subject });
      this.subscriptions[id].delete(subject);
      this.stats[socket.id].subs -= 1;
      this.stats[socket.id].active = Date.now();
    };

    socket.on(
      "unsubscribe",
      (x: { subject: string } | { subject: string }[], respond) => {
        let r;
        if (is_array(x)) {
          r = x.map(unsubscribe);
        } else {
          r = unsubscribe(x);
        }
        respond?.(r);
      },
    );

    socket.on("disconnecting", async () => {
      this.log("disconnecting", { id, user });
      delete this.stats[socket.id];
      if (added) {
        this.usage.delete(user);
      }
      const rooms = Array.from(socket.rooms) as string[];
      for (const room of rooms) {
        const subject = getSubjectFromRoom(room);
        this.unsubscribe({ socket, subject });
      }
      delete this.subscriptions[id];
    });
  };

  // create new client in the same process connected to this server.
  // This is useful for unit testing and is not cached by default (i.e., multiple
  // calls return distinct clients).
  client = (options?: ClientOptions): Client => {
    const port = this.options.port;
    const path = this.options.path?.slice(0, -"/conat".length) ?? "";
    const address = `http${this.options.ssl || port == 443 ? "s" : ""}://localhost:${port}${path}`;
    return connect({
      address,
      noCache: true,
      ...options,
    });
  };

  initSystemService = async () => {
    if (!this.options.systemAccountPassword) {
      throw Error("system service requires system account");
    }
    this.log("starting service listening on sys", this.options);
    const client = this.client({
      extraHeaders: { Cookie: `sys=${this.options.systemAccountPassword}` },
    });
    await client.service(
      "sys.conat.server",
      {
        stats: () => {
          return { [this.id]: this.stats };
        },
        usage: () => {
          return { [this.id]: this.usage.stats() };
        },
        // user has to explicitly refresh there browser after
        // being disconnected this way
        disconnect: (ids: string | string[]) => {
          if (typeof ids == "string") {
            ids = [ids];
          }
          for (const id of ids) {
            this.io.in(id).disconnectSockets();
          }
        },
      },
      { queue: this.id },
    );
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

export function randomChoice(v: Set<string>): string {
  if (v.size == 0) {
    throw Error("v must have size at least 1");
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

export function consistentChoice(v: Set<string>, resource: string): string {
  if (v.size == 0) {
    throw Error("v must have size at least 1");
  }
  if (v.size == 1) {
    for (const x of v) {
      return x;
    }
  }
  const hr = new ConsistentHash();
  const w = Array.from(v);
  w.sort();
  for (const x of w) {
    hr.add(x);
  }
  return hr.get(resource);
}

// See https://socket.io/how-to/get-the-ip-address-of-the-client
function getAddress(socket) {
  const header = socket.handshake.headers["forwarded"];
  if (header) {
    for (const directive of header.split(",")[0].split(";")) {
      if (directive.startsWith("for=")) {
        return directive.substring(4);
      }
    }
  }

  let addr = socket.handshake.headers["x-forwarded-for"]?.split(",")?.[0];
  if (addr) {
    return addr;
  }
  for (const other of ["cf-connecting-ip", "fastly-client-ip"]) {
    addr = socket.handshake.headers[other];
    if (addr) {
      return addr;
    }
  }

  return socket.handshake.address;
}
