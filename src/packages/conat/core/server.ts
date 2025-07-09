/*

Just try it out, start up node.js in this directory and:

    s = require('@cocalc/conat/core/server').init({port:4567, getUser:()=>{return {hub_id:'hub'}}})
    c = s.client();
    c.watch('foo')
    c2 = s.client();
    c2.pub('foo', 'bar')

To connect from another terminal:

    c = require('@cocalc/conat/core/client').connect({address:"http://localhost:4567"})
    c.state
      // 'connected'


cd packages/server


   s = await require('@cocalc/server/conat/socketio').initConatServer()

   s0 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0


---

*/

import type { ConnectionStats, ServerInfo } from "./types";
import {
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/conat/util";
import { Server } from "socket.io";
import { delay } from "awaiting";
import {
  ConatError,
  connect,
  Client,
  type ClientOptions,
  MAX_INTEREST_TIMEOUT,
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
import { Patterns } from "./patterns";
import { is_array } from "@cocalc/util/misc";
import { UsageMonitor } from "@cocalc/conat/monitor/usage";
import { once } from "@cocalc/util/async-utils";
import {
  clusterLink,
  type ClusterLink,
  clusterStreams,
  type ClusterStreams,
  trimClusterStreams,
  createClusterPersistServer,
  Sticky,
  Interest,
  hashInterest,
  hashSticky,
} from "./cluster";
import { type ConatSocketServer } from "@cocalc/conat/socket";
import { throttle } from "lodash";
import { getLogger } from "@cocalc/conat/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type SysConatServer, sysApiSubject, sysApi } from "./sys";
import { forkedConatServer } from "./start-server";
import { stickyChoice } from "./sticky";
import { EventEmitter } from "events";

const logger = getLogger("conat:core:server");

const DEFAULT_AUTOSCAN_INTERVAL = 15_000;
const DEFAULT_LONG_AUTOSCAN_INTERVAL = 60_000;

// If a cluster node has been disconnected for this long,
// unjoin it, thus freeing the stream tracking its state
// and also if it comes back it will have to explicitly
// join the cluster again.  This is primarily to not leak RAM
// when nodes are removed on purpose.  Supercluster nodes
// are never automatically forgetton.
const DEFAULT_FORGET_CLUSTER_NODE_INTERVAL = 30 * 60_000; // 30 minutes

const DEBUG = false;

export interface InterestUpdate {
  op: "add" | "delete";
  subject: string;
  queue?: string;
  room: string;
}

export interface StickyUpdate {
  pattern: string;
  subject: string;
  target: string;
}

interface Update {
  interest?: InterestUpdate;
  sticky?: StickyUpdate;
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
  id?: string;
  httpServer?;
  port?: number;
  path?: string;
  getUser?: UserFunction;
  isAllowed?: AllowFunction;
  maxSubscriptionsPerClient?: number;
  maxSubscriptionsPerHub?: number;
  systemAccountPassword?: string;
  // if true, use https when creating an internal client.
  ssl?: boolean;

  // if clusterName is set, enable clustering. Each node
  // in the cluster must have a different name. systemAccountPassword
  // must also be set.  This only has an impact when the id is '0'.
  // This publishes interest state in a stream, so uses more resources.
  clusterName?: string;

  // autoscanInterval = shortest interval when cluster will automatically
  // be scanned for new nodes.  It may be longer if there's no activity.
  // Set to 0 to disable autoscan, which is very useful for unit tests.
  // Defaults to 10_000 = 10 seconds.
  autoscanInterval?: number;
  longAutoscanInterval?: number;
  forgetClusterNodeInterval?: number;

  // if localClusterSize >=2 (and clusterName, etc. configured above),
  // creates a local cluster by spawning child processes with
  // ports the above port +1, +2, etc.
  localClusterSize?: number;

  // the ip address of this server on the cluster.
  clusterIpAddress?: string;
}

type State = "init" | "ready" | "closed";

export class ConatServer extends EventEmitter {
  public readonly io;
  public readonly id: string;

  private getUser: UserFunction;
  private isAllowed: AllowFunction;
  public readonly options: Partial<Options>;
  private cluster?: boolean;

  private sockets: { [id: string]: any } = {};
  private stats: { [id: string]: ConnectionStats } = {};
  private usage: UsageMonitor;
  public state: State = "init";

  private subscriptions: { [socketId: string]: Set<string> } = {};
  public interest: Interest = new Patterns();
  // the target string is JSON.stringify({ id: string; subject: string }),
  // which is the socket.io room to send the messages to.
  public sticky: Sticky = {};

  private clusterStreams?: ClusterStreams;
  private clusterLinks: {
    [clusterName: string]: { [id: string]: ClusterLink };
  } = {};
  private clusterLinksByAddress: { [address: string]: ClusterLink } = {};
  private clusterPersistServer?: ConatSocketServer;
  private clusterName?: string;
  private queuedClusterUpdates: Update[] = [];

  constructor(options: Options) {
    super();
    const {
      httpServer,
      port = 3000,
      ssl = false,
      id = "0",
      path = "/conat",
      getUser,
      isAllowed,
      maxSubscriptionsPerClient = MAX_SUBSCRIPTIONS_PER_CLIENT,
      maxSubscriptionsPerHub = MAX_SUBSCRIPTIONS_PER_HUB,
      systemAccountPassword,
      clusterName,
      autoscanInterval = DEFAULT_AUTOSCAN_INTERVAL,
      longAutoscanInterval = DEFAULT_LONG_AUTOSCAN_INTERVAL,
      forgetClusterNodeInterval = DEFAULT_FORGET_CLUSTER_NODE_INTERVAL,
      localClusterSize = 1,
      clusterIpAddress,
    } = options;
    this.clusterName = clusterName;
    this.options = {
      port,
      ssl,
      id,
      path,
      maxSubscriptionsPerClient,
      maxSubscriptionsPerHub,
      systemAccountPassword,
      clusterName,
      autoscanInterval,
      longAutoscanInterval,
      forgetClusterNodeInterval,
      localClusterSize,
      clusterIpAddress,
    };
    this.cluster = !!id && !!clusterName;
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
    });

    // NOTE: do NOT enable connectionStateRecovery; it seems to cause issues
    // when restarting the server.
    let adapter: any = undefined;

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
    this.io.on("connection", this.handleSocket);
    this.init();
  }

  private setState = (state: State) => {
    if (this.state == state) return;
    this.emit(state);
    this.state = state;
  };

  private isClosed = () => this.state == "closed";

  private init = async () => {
    if (this.options.systemAccountPassword) {
      await this.initSystemService();
    }
    if (this.clusterName) {
      await this.initCluster();
    }
    this.setState("ready");
  };

  private initUsage = () => {
    this.usage = new UsageMonitor({
      maxPerUser: MAX_CONNECTIONS_PER_USER,
      max: MAX_CONNECTIONS,
      resource: RESOURCE,
      log: (...args) => this.log("usage", ...args),
    });
  };

  // this is for the Kubernetes health check -- I haven't
  // thought at all about what to do here, really.
  // Hopefully experience can teach us.
  isHealthy = () => {
    if (this.isClosed()) {
      return false;
    }
    return true;
  };

  close = async () => {
    if (this.isClosed()) {
      return;
    }
    this.setState("closed");

    if (this.clusterStreams != null) {
      for (const name in this.clusterStreams) {
        this.clusterStreams[name].close();
      }
      delete this.clusterStreams;
    }
    for (const clusterName in this.clusterLinks) {
      const link = this.clusterLinks[clusterName];
      for (const id in link) {
        link[id].close();
        delete link[id];
      }
      delete this.clusterLinks[clusterName];
    }
    for (const address in this.clusterLinksByAddress) {
      delete this.clusterLinksByAddress[address];
    }
    this.clusterPersistServer?.close();
    delete this.clusterPersistServer;

    await delay(100);
    await this.io.close();
    for (const prop of ["interest", "subscriptions", "sockets", "services"]) {
      delete this[prop];
    }
    this.usage?.close();
    this.interest?.close();
    this.sticky = {};
    this.subscriptions = {};
    this.stats = {};
    this.sockets = {};
  };

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
      id: this.id,
      clusterName: this.clusterName,
    };
  };

  private log = (...args) => {
    logger.debug("id", this.id, ":", ...args);
  };

  private unsubscribe = async ({ socket, subject }) => {
    if (DEBUG) {
      this.log("unsubscribe ", { id: socket.id, subject });
    }
    const room = socketSubjectRoom({ socket, subject });
    socket.leave(room);
    await this.updateInterest({ op: "delete", subject, room });
  };

  ////////////////////////////////////
  // CLUSTER STREAM
  ////////////////////////////////////

  private publishUpdate = (update: Update) => {
    if (this.clusterStreams == null) {
      throw Error("streams must be initialized");
    }
    const { interest, sticky } = update;
    if (interest !== undefined) {
      this.clusterStreams.interest.publish(interest);
    }
    if (sticky !== undefined) {
      this.clusterStreams.sticky.publish(sticky);
    }
    this.trimClusterStream();
  };

  private updateClusterStream = (update: Update) => {
    if (!this.clusterName) return;

    if (this.clusterStreams !== undefined) {
      this.publishUpdate(update);
    } else {
      this.queuedClusterUpdates.push(update);
    }
  };

  // throttled because could be expensive -- once a minute it trims
  // operations that are definitely no longer relevant and are at least
  // several minutes old.  These are ops involving a pattern where
  // there is no interest in that pattern.
  private trimClusterStream = throttle(
    async () => {
      if (
        this.clusterStreams !== undefined &&
        this.interest !== undefined &&
        this.sticky !== undefined
      ) {
        await trimClusterStreams(
          this.clusterStreams,
          {
            interest: this.interest,
            sticky: this.sticky,
            links: Object.values(
              this.clusterLinks?.[this.clusterName ?? ""] ?? {},
            ),
          },
          15 * 60000,
        );
      }
    },
    60000,
    { leading: false, trailing: true },
  );

  ///////////////////////////////////////
  // INTEREST - PATTERNS USERS ARE SUBSCRIBED TO
  ///////////////////////////////////////

  private updateInterest = async (interest: InterestUpdate) => {
    if (this.isClosed()) return;
    // publish to the stream
    this.updateClusterStream({ interest });
    // update our local state
    updateInterest(interest, this.interest, this.sticky);
  };

  ///////////////////////////////////////
  // STICKY QUEUE GROUPS
  ///////////////////////////////////////

  private updateSticky = (sticky: StickyUpdate) => {
    if (updateSticky(sticky, this.sticky)) {
      this.updateClusterStream({ sticky });
    }
  };

  private getStickyTarget = ({ pattern, subject }) => {
    return this.sticky[pattern]?.[subject];
  };

  ///////////////////////////////////////
  // SUBSCRIBE and PUBLISH
  ///////////////////////////////////////

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

  // get all interest in this subject across the cluster (NOT supercluster)
  // This is a map from node id to array of patterns.
  private clusterInterest = (subject: string) => {
    const X: {
      [pattern: string]: { [queue: string]: { [nodeId: string]: Set<string> } };
    } = {};
    for (const pattern of this.interest.matches(subject)) {
      X[pattern] = {};
      const g = this.interest.get(pattern)!;
      for (const queue in g) {
        X[pattern][queue] = { [this.id]: g[queue] };
      }
    }
    if (this.clusterName == null) {
      return X;
    }
    const thisCluster = this.clusterLinks[this.clusterName];
    if (thisCluster == null) {
      return X;
    }
    for (const id in thisCluster) {
      const link = thisCluster[id];
      if (!link.isConnected()) {
        continue;
      }
      for (const pattern of link.interest.matches(subject)) {
        if (X[pattern] === undefined) {
          X[pattern] = {};
        }
        const g = link.interest.get(pattern)!;
        for (const queue in g) {
          if (X[pattern][queue] === undefined) {
            X[pattern][queue] = { [id]: g[queue] };
          } else {
            X[pattern][queue][id] = g[queue];
          }
        }
      }
    }
    return X;
  };

  private deliver = ({
    subject,
    data,
    targets,
  }: {
    subject: string;
    data: any;
    targets: { pattern: string; target: string }[];
  }): number => {
    // Deliver the messages to these targets, which should all be
    // connected to this server. This is used for cluster routing only.
    for (const { pattern, target } of targets) {
      this.io.to(target).emit(pattern, { subject, data });
    }
    return targets.length;
  };

  private publish = async ({
    subject,
    data,
    from,
  }: {
    subject: string;
    data: any;
    from: any;
  }): Promise<number> => {
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

    // note -- position 6 of data is a no-forward flag, to avoid
    // a message bouncing back and forth in case the interest stream
    // were slightly out of sync.
    const targets = data[6];
    if (targets != null) {
      return this.deliver({ subject, data, targets });
    }

    if (!this.cluster) {
      // Simpler non-cluster (or no forward) case.  We ONLY have to
      // consider data about this server, and no other nodes.
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
    }

    // More complicated cluster case, where we have to consider the
    // entire cluster, or possibly the supercluster.
    let count = 0;
    const outsideTargets: {
      [id: string]: { pattern: string; target: string }[];
    } = {};

    // const queueGroups: { [pattern: string]: Set<string> } = {};
    const clusterInterest = this.clusterInterest(subject);
    for (const pattern in clusterInterest) {
      const g = clusterInterest[pattern];
      for (const queue in g) {
        const t = this.clusterLoadBalance({
          pattern,
          subject,
          queue,
          targets: g[queue],
        });
        if (t !== undefined) {
          const { id, target } = t;
          if (id == this.id) {
            // another client of this server
            this.io.to(target).emit(pattern, { subject, data });
            count += 1;
          } else {
            // client connected to a different server -- we note this, and
            // will send everything for each server at once, instead of
            // potentially sending the same message multiple times for
            // different patterns.
            if (outsideTargets[id] == null) {
              outsideTargets[id] = [{ pattern, target }];
            } else {
              outsideTargets[id].push({ pattern, target });
            }
          }
        }
      }
    }

    if (!this.clusterName) {
      throw Error("clusterName must be set");
    }

    // Send the messages to the outsideTargets.  We send the message
    // along with exactly who it should be delivered to.  There is of
    // course no guarantee that a target doesn't vanish just as we are
    // sending this...
    for (const id in outsideTargets) {
      const link = this.clusterLinks[this.clusterName]?.[id];
      const data1 = [subject, ...data, outsideTargets[id]];
      count += 1;
      link?.client.conn.emit("publish", data1);
    }

    //
    // TODO: Supercluster routing.
    //
    //     // if no matches in local cluster, try the supercluster (if there is one)
    //     if (count == 0) {
    //       // nothing in this cluster, so try other clusters
    //       for (const clusterName in this.clusterLinks) {
    //         if (clusterName == this.clusterName) continue;
    //         const links = this.clusterLinks[clusterName];
    //         for (const id in links) {
    //           const link = links[id];
    //           const count2 = link.publish({ subject, data, queueGroups });
    //           if (count2 > 0) {
    //             count += count2;
    //             // once we publish to any other cluster, we are done.
    //             break;
    //           }
    //         }
    //       }
    //     }

    return count;
  };

  ///////////////////////////////////////
  // WHO GETS PUBLISHED MESSAGE:
  ///////////////////////////////////////
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
      return stickyChoice({
        pattern,
        subject,
        targets,
        updateSticky: this.updateSticky,
        getStickyTarget: this.getStickyTarget,
      });
    } else {
      return randomChoice(targets);
    }
  };

  clusterLoadBalance = ({
    pattern,
    subject,
    queue,
    targets: targets0,
  }: {
    pattern: string;
    subject: string;
    queue: string;
    targets: { [id: string]: Set<string> };
  }): { id: string; target: string } | undefined => {
    const targets = new Set<string>();
    for (const id in targets0) {
      for (const target of targets0[id]) {
        targets.add(JSON.stringify({ id, target }));
      }
    }
    const x = this.loadBalance({ pattern, subject, queue, targets });
    if (!x) {
      return undefined;
    }
    return JSON.parse(x);
  };

  ///////////////////////////////////////
  // MANAGING A CONNECTION FROM A CLIENT SOCKET
  ///////////////////////////////////////
  private handleSocket = async (socket) => {
    this.sockets[socket.id] = socket;
    socket.once("closed", () => {
      this.log("connection closed", socket.id);
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
    if (this.subscriptions[id] == null) {
      this.subscriptions[id] = new Set<string>();
    }

    socket.emit("info", { ...this.info(), user });

    socket.on("stats", ({ recv0 }) => {
      const s = this.stats[socket.id];
      if (s == null) return;
      s.recv = recv0;
    });

    socket.on(
      "wait-for-interest",
      async ({ subject, timeout = MAX_INTEREST_TIMEOUT }, respond) => {
        if (respond == null) {
          return;
        }
        if (!isValidSubjectWithoutWildcards(subject)) {
          respond({ error: "invalid subject" });
          return;
        }
        if (!(await this.isAllowed({ user, subject, type: "pub" }))) {
          const message = `permission denied waiting for interest in '${subject}' from ${JSON.stringify(user)}`;
          this.log(message);
          respond({ error: message, code: 403 });
        }
        try {
          respond(await this.waitForInterest(subject, timeout, socket.id));
        } catch (err) {
          respond({ error: `${err}` });
        }
      },
    );

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
        // console.log(this.id, "ERROR", err);
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

    socket.on("cluster", (respond) => {
      respond?.(this.clusterAddresses(this.clusterName));
    });

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

  address = () => getServerAddress(this.options);

  // create new client in the same process connected to this server.
  // This is especially useful for unit testing and is not cached
  // by default (i.e., multiple calls return distinct clients).
  client = (options?: ClientOptions): Client => {
    const address = this.address();
    this.log("client: connecting to - ", { address });
    return connect({
      address,
      noCache: true,
      ...options,
    });
  };

  private initCluster = async () => {
    if (!this.cluster) {
      return;
    }
    if (!this.id) {
      throw Error("if cluster is enabled, then the id must be set");
    }
    if (!this.clusterName) {
      throw Error("if cluster is enabled, then the clusterName must be set");
    }
    if (!this.options.systemAccountPassword) {
      throw Error("cluster must have systemAccountPassword set");
    }

    this.log("enabling cluster support", {
      id: this.id,
      clusterName: this.clusterName,
    });
    const client = this.client({
      systemAccountPassword: this.options.systemAccountPassword,
    });
    await client.waitUntilSignedIn();
    // What this does:
    // - Start a persist server that runs in same process but is just for
    //   use for coordinator cluster nodes.
    // - Publish interest updates to a dstream.
    // - Route messages from another cluster to subscribers in this cluster.

    this.log("creating persist server");
    this.clusterPersistServer = await createClusterPersistServer({
      client,
      id: this.id,
      clusterName: this.clusterName,
    });
    this.log("creating cluster streams");
    this.clusterStreams = await clusterStreams({
      client,
      id: this.id,
      clusterName: this.clusterName,
    });
    // add in everything so far in interest (TODO)
    if (this.queuedClusterUpdates.length > 0) {
      this.queuedClusterUpdates.map(this.publishUpdate);
      this.queuedClusterUpdates.length = 0;
    }
    this.initAutoscan();
    await this.initClusterNodes();
    this.log("cluster successfully initialized");
  };

  private initClusterNodes = async () => {
    const localClusterSize = this.options.localClusterSize ?? 1;
    if (localClusterSize < 2) {
      return;
    }
    // spawn additional servers as separate processes to form a cluster
    const port = this.options.port;
    if (!port) {
      throw Error("bug -- port must be set");
    }
    const f = async (i: number) => {
      const opts = {
        path: this.options.path,
        ssl: this.options.ssl,
        systemAccountPassword: this.options.systemAccountPassword,
        clusterName: this.options.clusterName,
        autoscanInterval: this.options.autoscanInterval,
        longAutoscanInterval: this.options.longAutoscanInterval,
        forgetClusterNodeInterval: this.options.forgetClusterNodeInterval,
        port: port + i,
        id: `${this.options.id}-${i}`,
      };
      await forkedConatServer(opts);
      await this.join(getServerAddress(opts));
    };
    const v: any[] = [];
    for (let i = 1; i < localClusterSize; i++) {
      v.push(f(i));
    }
    await Promise.all(v);
  };

  private initAutoscan = async () => {
    if (!this.options.autoscanInterval) {
      this.log("Cluster autoscan is DISABLED.");
      return;
    }
    this.log(`Cluster autoscan interval ${this.options.autoscanInterval}ms`);
    let lastCount = 1;
    while (!this.isClosed()) {
      let x;
      try {
        x = await this.scan();
        if (this.isClosed()) return;
      } catch (err) {
        // this should never happen unless there is a serious bug (?).
        this.log(`WARNING/BUG?: serious problem scanning -- ${err}`);
        throw err;
        await delay(this.options.longAutoscanInterval);
        continue;
      }
      if (x.errors.length > 0) {
        this.log(`WARNING: errors while scanning cluster`, x.errors);
      }
      if (x.count > 0 || lastCount > 0) {
        this.log(
          `cluster scan added ${x.count} links -- will scan again in ${this.options.autoscanInterval}`,
        );
        await delay(this.options.autoscanInterval);
      } else {
        this.log(
          `cluster scan found no new links -- waiting ${this.options.longAutoscanInterval}ms before next scan`,
        );
        await delay(this.options.longAutoscanInterval);
      }
      lastCount = x.count;
    }
  };

  private scanSoon = throttle(
    async () => {
      if (this.isClosed() || !this.options.autoscanInterval) {
        return;
      }
      let x;
      try {
        x = await this.scan();
      } catch (err) {
        this.log(
          `WARNING/BUG?: scanSoon -- serious problem scanning -- ${err}`,
        );
        return;
      }
      if (x.errors.length > 0) {
        this.log(
          `WARNING: scanSoon -- errors while scanning cluster`,
          x.errors,
        );
      }
    },

    10_000,
    {
      leading: true,
      trailing: true,
    },
  );

  // Join this node to the cluster that contains a node with the given address.
  // - the address obviously must be reachable over the network
  // - the systemAccountPassword of this node and the one with the given
  //   address must be the same.
  join = reuseInFlight(async (address: string): Promise<ClusterLink> => {
    if (!this.options.systemAccountPassword) {
      throw Error("systemAccountPassword must be set");
    }
    logger.debug("join: connecting to ", address);
    const link0 = this.clusterLinksByAddress[address];
    if (link0 != null) {
      logger.debug("join: already connected to ", address);
      return link0;
    }
    try {
      const link = await clusterLink(
        address,
        this.options.systemAccountPassword,
        this.updateSticky,
      );
      const { clusterName, id } = link;
      if (this.clusterLinks[clusterName] == null) {
        this.clusterLinks[clusterName] = {};
      }
      this.clusterLinks[clusterName][id] = link;
      this.clusterLinksByAddress[address] = link;
      this.scanSoon();
      logger.debug("join: successfully created new connection to ", address);
      return link;
    } catch (err) {
      logger.debug("join: FAILED creating a new connection to ", address, err);
      throw err;
    }
  });

  unjoin = ({
    id,
    clusterName,
    address,
  }: {
    clusterName?: string;
    id?: string;
    address?: string;
  }) => {
    if (!clusterName && !id && !address) {
      throw Error(
        "at least one of clusterName, id or address must be specified",
      );
    }
    let link;
    if (address) {
      link = this.clusterLinksByAddress[address];
    } else {
      if (!id) {
        throw Error("if address is not given then id must be given");
      }
      const cluster = clusterName ?? this.clusterName;
      if (!cluster) {
        throw "clusterName must be set";
      }
      link = this.clusterLinks[cluster]?.[id];
    }
    if (link === undefined) {
      // already gone
      return;
    }
    link.close();
    delete this.clusterLinks[link.clusterName][link.id];
    delete this.clusterLinksByAddress[link.address];
    if (Object.keys(this.clusterLinks[link.clusterName]).length == 0) {
      delete this.clusterLinks[link.clusterName];
    }
  };

  private initSystemService = async () => {
    if (!this.options.systemAccountPassword) {
      throw Error("system service requires system account");
    }
    this.log("starting service listening on sys...");
    const client = this.client({
      extraHeaders: { Cookie: `sys=${this.options.systemAccountPassword}` },
    });

    const stats = async () => {
      return { [this.id]: this.stats };
    };
    const usage = async () => {
      return { [this.id]: this.usage.stats() };
    };
    // user has to explicitly refresh there browser after
    // being disconnected this way
    const disconnect = async (ids: string | string[]) => {
      if (typeof ids == "string") {
        ids = [ids];
      }
      for (const id of ids) {
        this.io.in(id).disconnectSockets();
      }
    };

    const subject = sysApiSubject({ clusterName: this.clusterName });
    // services that ALL servers answer, i.e., a single request gets
    // answers from all members of the cluster.
    await client.service<SysConatServer>(
      subject,
      {
        stats,
        usage,
        disconnect,
        join: () => {
          throw Error("wrong service");
        },
        unjoin: () => {
          throw Error("wrong service");
        },
        clusterTopology: () => {
          throw Error("wrong service");
        },
        clusterAddresses: () => {
          throw Error("wrong service");
        },
      },
      { queue: `${this.clusterName}-${this.id}` },
    );
    this.log(`successfully started ${subject} service`);

    const subject2 = sysApiSubject({
      clusterName: this.clusterName,
      id: this.id,
    });

    await client.service<SysConatServer>(subject2, {
      stats,
      usage,
      // user has to explicitly refresh there browser after
      // being disconnected this way
      disconnect,
      join: async (address: string) => {
        await this.join(address);
      },
      unjoin: async (opts: { clusterName?: string; id: string }) => {
        await this.unjoin(opts);
      },

      clusterTopology: async (): Promise<{
        // map from id to address
        [clusterName: string]: { [id: string]: string };
      }> => this.clusterTopology(),

      // addresses of all nodes in the (super-)cluster
      clusterAddresses: async (clusterName?: string): Promise<string[]> =>
        this.clusterAddresses(clusterName),
    });
    this.log(`successfully started ${subject2} service`);
  };

  clusterAddresses = (clusterName?: string) => {
    const v: string[] = [];
    if (!clusterName) {
      v.push(this.address());
      for (const addr in this.clusterLinksByAddress) {
        const link = this.clusterLinksByAddress[addr];
        if (link.isConnected()) {
          v.push(addr);
        }
      }
      return v;
    }
    if (clusterName == this.clusterName) {
      v.push(this.address());
    }
    for (const address in this.clusterLinksByAddress) {
      if (
        this.clusterLinksByAddress[address].isConnected() &&
        this.clusterLinksByAddress[address].clusterName == clusterName
      ) {
        v.push(address);
      }
    }
    return v;
  };

  clusterTopology = (): {
    // map from id to address
    [clusterName: string]: { [id: string]: string };
  } => {
    if (!this.clusterName || !this.id) {
      throw Error("not in cluster mode");
    }
    const addresses: { [clusterName: string]: { [id: string]: string } } = {};
    for (const clusterName in this.clusterLinks) {
      addresses[clusterName] = {};
      const C = this.clusterLinks[clusterName];
      for (const id in C) {
        addresses[clusterName][id] = C[id].address;
      }
    }
    if (addresses[this.clusterName] == null) {
      addresses[this.clusterName] = {};
    }
    addresses[this.clusterName][this.id] = this.address();
    return addresses;
  };

  // scan via any nodes we're connected to for other known nodes in the cluster
  // that we're NOT connected to.  If every node does this periodically (and the
  // cluster isn't constantly changing, then each component of the digraph
  // will eventually be a complete graph.  In particular, this function returns
  // the number of links created (count), so if it returns 0 when called on all nodes, then
  // we're done until new nodes are added.
  scan = reuseInFlight(async (): Promise<{ count: number; errors: any[] }> => {
    if (this.isClosed()) {
      return { count: 0, errors: [] };
    }
    const knownByUs = new Set(this.clusterAddresses(this.clusterName));
    const unknownToUs = new Set<string>([]);
    const errors: { err: any; desc: string }[] = [];

    // in parallel, we use the sys api to call all nodes we know about
    // and ask them "heh, what nodes in this cluster do *YOU* know about"?
    // if any come back that we don't know about, we add them to unknownToUs.
    let count = 0;

    const f = async (client) => {
      try {
        const sys = sysApi(client);
        const knownByRemoteNode = new Set(
          await sys.clusterAddresses(this.clusterName),
        );
        if (this.isClosed()) return;
        logger.debug(
          "scan: remote",
          client.options.address,
          "knows about ",
          knownByRemoteNode,
        );
        for (const address of knownByRemoteNode) {
          if (!knownByUs.has(address)) {
            unknownToUs.add(address);
          }
        }
        if (!knownByRemoteNode.has(this.address())) {
          // we know about them, but they don't know about us, so ask them to link to us.
          logger.debug(
            "scan: asking remote ",
            client.options.address,
            " to link to us",
          );
          await sys.join(this.address());
          if (this.isClosed()) return;
          count += 1;
        }
      } catch (err) {
        errors.push({
          err,
          desc: `requesting remote ${client.options.address} join us`,
        });
      }
    };

    if (!this.clusterName) {
      throw Error("if cluster is enabled, then the clusterName must be set");
    }

    await Promise.all(
      Object.values(this.clusterLinks[this.clusterName] ?? {})
        .filter((link) => {
          if (link.isConnected()) {
            return true;
          } else {
            if (
              link.howLongDisconnected() >=
              (this.options.forgetClusterNodeInterval ??
                DEFAULT_FORGET_CLUSTER_NODE_INTERVAL)
            ) {
              // forget about this link
              this.unjoin(link);
            }
          }
        })
        .map((link) => f(link.client)),
    );
    if (unknownToUs.size == 0 || this.isClosed()) {
      return { count, errors };
    }

    // Now (in parallel), join with all unknownToUs nodes.
    const g = async (address: string) => {
      try {
        await this.join(address);
        count += 1;
      } catch (err) {
        errors.push({ err, desc: `joining to ${address}` });
      }
    };
    const v = Array.from(unknownToUs).map(g);

    await Promise.all(v);

    return { count, errors };
  });

  private waitForInterest = async (
    subject: string,
    timeout: number,
    socketId: string,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    if (!this.cluster) {
      // not a cluster
      return await this.waitForInterestOnThisNode(
        subject,
        timeout,
        socketId,
        signal,
      );
    }
    // check if there is already interest in the local cluster
    const links = this.superclusterLinks();
    for (const link of links) {
      if (link.hasInterest(subject)) {
        return true;
      }
    }

    // wait for interest in any node on any cluster
    return await this.waitForInterestInLinks(
      subject,
      timeout,
      socketId,
      signal,
      links,
    );
  };

  private superclusterLinks = (): ClusterLink[] => {
    let links: ClusterLink[] = [];
    for (const clusterName in this.clusterLinks) {
      links = links.concat(Object.values(this.clusterLinks[clusterName]));
    }
    return links;
  };

  private waitForInterestInLinks = async (
    subject,
    timeout,
    socketId,
    signal,
    links: ClusterLink[],
  ): Promise<boolean> => {
    const v: any[] = [];
    let done = false;
    try {
      // we use AbortController etc below so we can cancel waiting once
      // we get any interest.
      const nothrow = async (f) => {
        try {
          return await f;
        } catch (err) {
          if (!done) {
            logger.debug(`WARNING: waitForInterestInLinks -- ${err}`);
          }
        }
        return false;
      };
      const controller = new AbortController();
      const signal2 = controller.signal;
      v.push(
        nothrow(
          this.waitForInterestOnThisNode(subject, timeout, socketId, signal2),
        ),
      );
      for (const link of links) {
        v.push(nothrow(link.waitForInterest(subject, timeout, signal2)));
      }
      if (!timeout) {
        // with timeout=0 they all immediately answer (so no need to worry about abort/promise)
        const w = await Promise.all(v);
        for (const x of w) {
          if (x) {
            return true;
          }
        }
        return false;
      }

      signal?.addEventListener("abort", () => {
        controller.abort();
      });
      const w = await Promise.race(v);
      // cancel all the others.
      controller.abort();
      return w;
    } finally {
      done = true;
    }
  };

  private waitForInterestOnThisNode = async (
    subject: string,
    timeout: number,
    socketId: string,
    signal?: AbortSignal,
  ) => {
    const matches = this.interest.matches(subject);
    if (matches.length > 0 || !timeout) {
      // NOTE: we never return the actual matches, since this is a
      // potential security vulnerability.
      // it could make it very easy to figure out private inboxes, etc.
      return matches.length > 0;
    }
    if (timeout > MAX_INTEREST_TIMEOUT) {
      timeout = MAX_INTEREST_TIMEOUT;
    }
    const start = Date.now();
    while (!this.isClosed() && this.sockets[socketId] && !signal?.aborted) {
      if (Date.now() - start >= timeout) {
        throw Error("timeout");
      }
      try {
        // if signal is set only wait for the change for up to 1 second.
        await once(this.interest, "change", signal != null ? 1000 : undefined);
      } catch {
        continue;
      }
      if (this.isClosed() || !this.sockets[socketId] || signal?.aborted) {
        return false;
      }
      const hasMatch = this.interest.hasMatch(subject);
      if (hasMatch) {
        return true;
      }
    }
    return false;
  };

  hash = (): { interest: number; sticky: number } => {
    return {
      interest: hashInterest(this.interest),
      sticky: hashSticky(this.sticky),
    };
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

export function updateInterest(
  update: InterestUpdate,
  interest: Interest,
  sticky: Sticky,
) {
  const { op, subject, queue, room } = update;
  const groups = interest.get(subject);
  if (op == "add") {
    if (typeof queue != "string") {
      throw Error("queue must not be null for add");
    }
    if (groups === undefined) {
      interest.set(subject, { [queue]: new Set([room]) });
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
        interest.delete(subject);
        delete sticky[subject];
      }
    }
  } else {
    throw Error(`invalid op ${op}`);
  }
}

// returns true if this update actually causes a change to sticky
export function updateSticky(update: StickyUpdate, sticky: Sticky): boolean {
  const { pattern, subject, target } = update;
  if (sticky[pattern] === undefined) {
    sticky[pattern] = {};
  }
  if (sticky[pattern][subject] == target) {
    return false;
  }
  sticky[pattern][subject] = target;
  return true;
}

function getServerAddress(options: Options) {
  const port = options.port;
  const path = options.path?.slice(0, -"/conat".length) ?? "";
  return `http${options.ssl || port == 443 ? "s" : ""}://${options.clusterIpAddress ?? "localhost"}:${port}${path}`;
}

/*
const watching = new Set(["xyz"]);
let last = Date.now();
function watch(action, { subject, data, id, from }) {
  for (const x of watching) {
    if (subject.includes(x)) {
      console.log(Date.now() - last, new Date(), action, id, {
        subject,
        data,
        from,
      });
      last = Date.now();
      if (data[5]?.["CN-Reply"]) {
        watching.add(data[5]["CN-Reply"]);
      }
    }
  }
}
function trace(subject, ...args) {
  for (const x of watching) {
    if (subject.includes(x)) {
      console.log(Date.now() - last, new Date(), subject, ...args);
      last = Date.now();
    }
  }
}
*/
