/*

Just try it out, start up node.js in this directory and:

    s = require('@cocalc/conat/core/server').init({port:4567, getUser:()=>{return {hub_id:'hub'}}})
    c = s.client();
    c.watch('foo')
    c2 = s.client();
    c2.pub('foo', 'bar')


cd packages/server


   s = await require('@cocalc/server/conat/socketio').initConatServer()

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0


For valkey clustering:

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({valkey:'valkey://localhost:6379', port:3000, getUser:()=>{return {hub_id:'hub'}}})

   s1 = await require('@cocalc/server/conat/socketio').initConatServer({valkey:'valkey://localhost:6379', port:3001, getUser:()=>{return {hub_id:'hub'}}})

Corresponding clients:

   c0 = require('@cocalc/conat/core/client').connect('http://localhost:3000')

   c1 = require('@cocalc/conat/core/client').connect('http://localhost:3001')


---

Or from cocalc/src

   pnpm conat-server

*/

import type { ConnectionStats, ServerInfo } from "./types";
import {
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/conat/util";
import { createAdapter as createValkeyStreamsAdapter } from "@cocalc/redis-streams-adapter";
import { createAdapter as createValkeyPubSubAdapter } from "@socket.io/redis-adapter";
import Valkey from "iovalkey";
import { Server } from "socket.io";
import { callback, delay } from "awaiting";
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
import { until } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:core:server");

const INTEREST_STREAM = "interest";
const STICKY_STREAM = "sticky";

const VALKEY_OPTIONS = { maxRetriesPerRequest: null };
const USE_VALKEY_PUBSUB = true;

const VALKEY_READ_COUNT = 100;

export function valkeyClient(valkey) {
  if (typeof valkey == "string") {
    if (valkey.startsWith("{") && valkey.endsWith("}")) {
      return new Valkey({ ...VALKEY_OPTIONS, ...JSON.parse(valkey) });
    } else {
      return new Valkey(valkey, VALKEY_OPTIONS);
    }
  } else {
    return new Valkey({ ...VALKEY_OPTIONS, ...valkey });
  }
}

const DEBUG = false;

interface InterestUpdate {
  op: "add" | "delete";
  subject: string;
  queue?: string;
  room: string;
}

interface StickyUpdate {
  pattern: string;
  subject: string;
  target: string;
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
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  valkey?:
    | string
    | {
        port?: number;
        host?: string;
        username?: string;
        password?: string;
        db?: number;
      };
  cluster?: boolean;
  maxSubscriptionsPerClient?: number;
  maxSubscriptionsPerHub?: number;
  systemAccountPassword?: string;
  // if true, use https when creating an internal client.
  ssl?: boolean;
}

type State = "ready" | "closed";

export class ConatServer {
  public readonly io;
  public readonly id: string;

  private getUser: UserFunction;
  private isAllowed: AllowFunction;
  readonly options: Partial<Options>;
  private cluster?: boolean;

  private sockets: { [id: string]: any } = {};
  private disconnectingTimeout: {
    [id: string]: ReturnType<typeof setTimeout>;
  } = {};

  private stats: { [id: string]: ConnectionStats } = {};
  private usage: UsageMonitor;
  private state: State = "ready";

  private subscriptions: { [socketId: string]: Set<string> } = {};
  private interest: Patterns<{ [queue: string]: Set<string> }> = new Patterns();
  private interestUpdates: InterestUpdate[] = [];
  private sticky: {
    // the target string is JSON.stringifh({ id: string; subject: string }), which is the
    // socket.io room to send the messages to.
    [pattern: string]: { [subject: string]: string };
  } = {};
  private stickyUpdates: StickyUpdate[] = [];

  constructor(options: Options) {
    const {
      httpServer,
      port = 3000,
      ssl = false,
      id = randomId(),
      path = "/conat",
      getUser,
      isAllowed,
      valkey,
      cluster,
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
    this.cluster = cluster || !!valkey;
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
    this.log("Starting Conat server...", {
      id,
      path,
      port: this.options.port,
      httpServer: httpServer ? "httpServer(...)" : undefined,
      valkey: !!valkey, // valkey has password in it so do not log
    });

    // NOTE: do NOT enable connectionStateRecovery; it seems to cause issues
    // when restarting the server.
    let adapter: any = undefined;
    if (valkey) {
      this.log("using valkey");
      const c = valkeyClient(valkey);
      if (USE_VALKEY_PUBSUB) {
        this.log("using the valkey pub/sub adapter");
        adapter = createValkeyPubSubAdapter(c, c.duplicate());
      } else {
        this.log("using the valkey streams adapter with low-latency config");
        adapter = createValkeyStreamsAdapter(c, {
          readCount: VALKEY_READ_COUNT,
          blockTime: 1,
        });
      }
    }

    const socketioOptions = {
      maxHttpBufferSize: MAX_PAYLOAD,
      path,
      adapter,
      // perMessageDeflate is disabled by default in socket.io, but it
      // seems unclear exactly *why*:
      //   https://github.com/socketio/socket.io/issues/3477#issuecomment-930503313
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

  private init = async () => {
    this.io.on("connection", this.handleSocket);
    if (this.cluster) {
      if (this.options.valkey == null) {
        // the cluster adapter doesn't get configured until after the constructor,
        // so we wait a moment before configuring these.
        await delay(1);
      }
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
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
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
    logger.debug(this.id, ":", ...args);
  };

  private unsubscribe = async ({ socket, subject }) => {
    if (DEBUG) {
      this.log("unsubscribe ", { id: socket.id, subject });
    }
    const room = socketSubjectRoom({ socket, subject });
    socket.leave(room);
    await this.updateInterest({ op: "delete", subject, room });
  };

  // INTEREST

  private updateInterest = async (update: InterestUpdate) => {
    this._updateInterest(update);
    if (!this.cluster) return;
    // console.log(this.options.port, "cluster: publish interest change", update);
    this.io.of("cluster").serverSideEmit(INTEREST_STREAM, "update", update);
  };

  private initInterest = async () => {
    if (!this.cluster) return;
    const getStateFromCluster = (cb) => {
      this.io.of("cluster").serverSideEmit(INTEREST_STREAM, "init", cb);
    };

    await until(
      async () => {
        try {
          const responses = (await callback(getStateFromCluster)).filter(
            (x) => x.length > 0,
          );
          // console.log("initInterest got", responses);
          if (responses.length > 0) {
            for (const response of responses) {
              for (const update of response) {
                this._updateInterest(update);
              }
            }
            return true;
          } else {
            // console.log(`init interest state -- waiting for other nodes...`);
            return false;
          }
        } catch (err) {
          console.log(`initInterest: WARNING -- ${err}`);
          return false;
        }
      },
      { start: 100, decay: 1.5, max: 5000 },
    );
  };

  private initInterestSubscription = async () => {
    if (!this.cluster) return;

    this.initInterest();

    this.io.of("cluster").on(INTEREST_STREAM, (action, args) => {
      // console.log("INTEREST_STREAM received", { action, args });
      if (action == "update") {
        // console.log("applying interest update", args);
        this._updateInterest(args);
      } else if (action == "init") {
        args(this.interestUpdates);
      }
    });
  };

  private _updateInterest = (update: InterestUpdate) => {
    if (this.state != "ready") return;
    this.interestUpdates.push(update);
    const { op, subject, queue, room } = update;
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

  // STICKY

  private initSticky = async () => {
    if (!this.cluster) return;
    const getStateFromCluster = (cb) => {
      this.io.of("cluster").serverSideEmit(STICKY_STREAM, "init", cb);
    };

    await until(
      async () => {
        try {
          const responses = (await callback(getStateFromCluster)).filter(
            (x) => x.length > 0,
          );
          // console.log("initSticky got", responses);
          if (responses.length > 0) {
            for (const response of responses) {
              for (const update of response) {
                this._updateSticky(update);
              }
            }
            return true;
          } else {
            // console.log(`init sticky state -- waiting for other nodes...`);
            return false;
          }
        } catch (err) {
          console.log(`initInterest: WARNING -- ${err}`);
          return false;
        }
      },
      { start: 100, decay: 1.5, max: 5000 },
    );
  };

  private initStickySubscription = async () => {
    if (!this.cluster) return;

    this.initSticky();

    this.io.of("cluster").on(STICKY_STREAM, (action, args) => {
      // console.log("STICKY_STREAM received", { action, args });
      if (action == "update") {
        this._updateSticky(args);
      } else if (action == "init") {
        // console.log("sending stickyUpdates", this.stickyUpdates);
        args(this.stickyUpdates);
      }
    });
  };

  private updateSticky = async (update: StickyUpdate) => {
    this._updateSticky(update);
    if (!this.cluster) return;

    // console.log(this.options.port, "cluster: publish sticky update", update);
    this.io.of("cluster").serverSideEmit(STICKY_STREAM, "update", update);
  };

  private _updateSticky = (update: StickyUpdate) => {
    this.stickyUpdates.push(update);
    const { pattern, subject, target } = update;
    if (this.sticky[pattern] === undefined) {
      this.sticky[pattern] = {};
    }
    this.sticky[pattern][subject] = target;
  };

  private getStickyTarget = ({ pattern, subject }) => {
    return this.sticky[pattern]?.[subject];
  };

  //

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
          `there is a limit of at most ${maxSubs} subscriptions and you currently have ${numSubs} subscriptions -- subscription to '${subject}' denied`,
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
      const v = subject.split(".");
      subject = v.slice(0, v.length - 1).join(".");
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
      recv: { messages: 0, bytes: 0 },
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

    socket.on("stats", ({ recv0 }) => {
      const s = this.stats[socket.id];
      if (s == null) return;
      s.recv = recv0;
    });

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
  private address = () => {
    const port = this.options.port;
    const path = this.options.path?.slice(0, -"/conat".length) ?? "";
    return `http${this.options.ssl || port == 443 ? "s" : ""}://localhost:${port}${path}`;
  };

  client = (options?: ClientOptions): Client => {
    const address = this.address();
    this.log("client: connecting to - ", { address });
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
    this.log("starting service listening on sys...");
    const client = this.client({
      extraHeaders: { Cookie: `sys=${this.options.systemAccountPassword}` },
    });
    try {
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
      this.log(`successfully started sys.conat.server service`);
    } catch (err) {
      this.log(`WARNING: unable to start sys.conat.server service -- ${err}`);
    }
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
