import {
  messageData,
  type Subscription,
  type Headers,
  ConatError,
} from "@cocalc/conat/core/client";
import { ConatSocketBase } from "./base";
import { type TCP, createTCP } from "./tcp";
import {
  SOCKET_HEADER_CMD,
  SOCKET_HEADER_CONNECT_ATTEMPT,
  DEFAULT_COMMAND_TIMEOUT,
  type ConatSocketOptions,
  serverStatusSubject,
} from "./util";
import { EventIterator } from "@cocalc/util/event-iterator";
import { keepAlive, KeepAlive } from "./keepalive";
import { getLogger } from "@cocalc/conat/client";
import { once } from "@cocalc/util/async-utils";

const logger = getLogger("socket:client");

// DO NOT directly instantiate here -- instead, call the
// socket.connect method on ConatClient.

// Schedule a callback for the next event-loop turn.  Falls back to
// setTimeout(..., 0) if setImmediate isn't available (e.g. jsdom).
const nextTurn = (f: () => void) => {
  if (typeof globalThis.setImmediate == "function") {
    globalThis.setImmediate(f);
  } else {
    setTimeout(f, 0);
  }
};

export class ConatSocketClient extends ConatSocketBase {
  queuedWrites: { data: any; headers?: Headers }[] = [];
  private tcp?: TCP;
  private alive?: KeepAlive;
  private serverId?: string;
  private loadBalancer?: (subject: string) => Promise<string>;
  // Inbound `data` events are buffered and emitted one per event-loop
  // turn so back-to-back data events don't get coalesced from the
  // perspective of synchronous EventEmitter consumers.
  private dataQueue: { data: any; headers?: Headers }[] = [];
  private dataQueueScheduled = false;
  // For the connect-control handshake: each connect attempt gets a unique id
  // we tag onto the publish so the matching `connected` reply can be
  // correlated.  Not strictly required for correctness today but lets us
  // ignore stale `connected` replies after disconnect+reconnect.
  private nextConnectAttemptId = 0;
  private connectAttempts = new Set<number>();
  // Legacy compat probe state (request/reply against pre-PR-8869
  // servers).  Probe is deferred to give the modern publish/publish
  // path a chance first, then retried with backoff if it times out --
  // a transient probe failure must NOT leave a new client unable to
  // ever reach an old server.
  private legacyConnectProbeScheduled = false;
  private legacyConnectProbeTimer?: ReturnType<typeof setTimeout>;
  // 1.5s gives modern handshakes plenty of room (typically <100ms,
  // worst-case cross-cluster a couple of seconds) before we incur the
  // cost of an inbox subscription.  Empirically, going to 0 or even
  // 200ms here causes persist/cluster.test.ts and sync/cluster.test.ts
  // to time out on the failover path because per-socket probe traffic
  // congests cluster interest propagation.
  private static readonly LEGACY_CONNECT_PROBE_DELAY = 1500;

  constructor(opts: ConatSocketOptions) {
    super(opts);
    this.loadBalancer = opts.loadBalancer;
    logger.silly("creating a client socket connecting to ", this.subject);
    this.initTCP();
    this.on("ready", () => {
      for (const mesg of this.queuedWrites) {
        this.sendDataToServer(mesg);
      }
    });
    if (this.tcp == null) {
      throw Error("bug");
    }
  }

  // subject to send messages/data to the socket server.
  serverSubject = (): string => {
    if (!this.serverId) {
      throw Error("no server selected");
    }
    return `${this.subject}.server.${this.serverId}.${this.id}`;
  };

  channel(channel: string) {
    return this.client.socket.connect(this.subject + "." + channel, {
      desc: `${this.desc ?? ""}.channel('${channel}')`,
      maxQueueSize: this.maxQueueSize,
    }) as ConatSocketClient;
  }

  private initKeepAlive = () => {
    this.alive?.close();
    this.alive = keepAlive({
      role: "client",
      ping: async () =>
        await this.request(null, {
          headers: { [SOCKET_HEADER_CMD]: "ping" },
          timeout: this.keepAliveTimeout,
        }),
      disconnect: this.disconnect,
      keepAlive: this.keepAlive,
    });
  };

  initTCP() {
    if (this.tcp != null) {
      throw Error("this.tcp already initialized");
    }
    // request = send a socket request mesg to the server side of the socket
    // either ack what's received or asking for a resend of missing data.
    const request = async (mesg, opts?) =>
      await this.client.request(this.serverSubject(), mesg, {
        ...opts,
        headers: { ...opts?.headers, [SOCKET_HEADER_CMD]: "socket" },
      });

    this.tcp = createTCP({
      request,
      role: this.role,
      reset: this.disconnect,
      send: this.sendToServer,
      size: this.maxQueueSize,
    });

    this.client.on("disconnected", this.tcp.send.resendLastUntilAcked);

    this.tcp.recv.on("message", (mesg) => {
      this.enqueueData(mesg.data, mesg.headers);
    });
    this.tcp.send.on("drain", () => {
      this.emit("drain");
    });
  }

  private enqueueData = (data: any, headers?: Headers) => {
    this.dataQueue.push({ data, headers });
    this.scheduleDataDelivery();
  };

  private scheduleDataDelivery = () => {
    if (this.dataQueueScheduled) {
      return;
    }
    this.dataQueueScheduled = true;
    nextTurn(() => {
      this.dataQueueScheduled = false;
      const mesg = this.dataQueue.shift();
      if (mesg == null || this.state == "closed") {
        return;
      }
      this.emit("data", mesg.data, mesg.headers);
      if (this.dataQueue.length > 0) {
        this.scheduleDataDelivery();
      }
    });
  };

  // Synchronously drain pending data events.  Used by the request path
  // so a request handler sees any preceding data first.
  flushDataQueue = () => {
    while (this.dataQueue.length > 0 && this.state != "closed") {
      const mesg = this.dataQueue.shift();
      if (mesg != null) {
        this.emit("data", mesg.data, mesg.headers);
      }
    }
  };

  waitUntilDrain = async () => {
    await this.tcp?.send.waitUntilDrain();
  };

  private sendCommandToServer = async (
    cmd: "close" | "ping",
    timeout = DEFAULT_COMMAND_TIMEOUT,
  ) => {
    const headers = {
      [SOCKET_HEADER_CMD]: cmd,
      id: this.id,
    };
    const subject = this.serverSubject();
    logger.silly("sendCommandToServer", { cmd, timeout, subject });
    const resp = await this.client.request(subject, null, {
      headers,
      timeout,
    });

    const value = resp.data;
    logger.silly("sendCommandToServer: got resp", { cmd, value, subject });
    if (value?.error) {
      throw Error(value?.error);
    } else {
      return value;
    }
  };

  // Send a `connect` control message to the server.
  //   - Modern (post-PR-8869) servers see the publishSync (no inbox)
  //     and reply via publish to the client subject we already
  //     subscribed to.  This is the common case.
  //   - Legacy (pre-PR-8869) servers only respond on a request inbox.
  //     A deferred compat probe fires LEGACY_CONNECT_PROBE_DELAY ms
  //     after the publishSync, which gives the modern path a chance
  //     to complete first.  If the probe times out (transient
  //     failure or simply slow response), the .catch re-schedules
  //     it -- a new client must never be left unable to reach an
  //     old server because of one transient timeout.
  private sendConnectCommand = () => {
    const attempt = this.nextConnectAttemptId++;
    this.connectAttempts.add(attempt);
    const subject = this.serverSubject();
    const headers = {
      [SOCKET_HEADER_CMD]: "connect",
      [SOCKET_HEADER_CONNECT_ATTEMPT]: attempt,
      id: this.id,
    };
    logger.silly("sendConnectCommand", { attempt, subject });
    this.client.publishSync(subject, null, { headers });
    this.scheduleLegacyConnectProbe(subject);
  };

  private scheduleLegacyConnectProbe = (subject: string) => {
    if (this.legacyConnectProbeScheduled || this.state != "connecting") {
      return;
    }
    this.legacyConnectProbeScheduled = true;
    this.legacyConnectProbeTimer = setTimeout(
      () => this.runLegacyConnectProbe(subject),
      ConatSocketClient.LEGACY_CONNECT_PROBE_DELAY,
    );
  };

  private runLegacyConnectProbe = (subject: string) => {
    this.legacyConnectProbeTimer = undefined;
    if (this.state != "connecting") {
      this.legacyConnectProbeScheduled = false;
      return;
    }
    const attempt = this.nextConnectAttemptId++;
    this.connectAttempts.add(attempt);
    const headers = {
      [SOCKET_HEADER_CMD]: "connect",
      [SOCKET_HEADER_CONNECT_ATTEMPT]: attempt,
      id: this.id,
    };
    void this.client
      .request(subject, null, { headers, timeout: 5_000 })
      .then((resp) => {
        if (resp.data == "connected") {
          this.legacyConnectProbeScheduled = false;
          this.handleConnected({
            headers: { [SOCKET_HEADER_CONNECT_ATTEMPT]: attempt },
          });
          return;
        }
        // Unexpected non-"connected" data -- treat as failure and
        // retry-schedule below.
        this.legacyConnectProbeScheduled = false;
        this.scheduleLegacyConnectProbe(subject);
      })
      .catch(() => {
        // Probe timed out (transient against an old server, or modern
        // server that doesn't reply on inbox).  Reset and reschedule
        // so a transient failure cannot wedge the socket against a
        // legacy server.
        this.legacyConnectProbeScheduled = false;
        this.scheduleLegacyConnectProbe(subject);
      });
  };

  private cancelLegacyConnectProbe = () => {
    if (this.legacyConnectProbeTimer) {
      clearTimeout(this.legacyConnectProbeTimer);
      this.legacyConnectProbeTimer = undefined;
    }
    this.legacyConnectProbeScheduled = false;
  };

  private handleConnected = (mesg) => {
    // Only accept "connected" while we are actively connecting.  Any other
    // state means the reply is stale: state == "ready" already handshook,
    // state == "disconnected" or "closed" means the session has been torn
    // down -- a delayed reply must not promote the socket back to ready.
    if (this.state != "connecting") {
      return;
    }
    const rawAttempt = mesg.headers?.[SOCKET_HEADER_CONNECT_ATTEMPT];
    const attempt =
      typeof rawAttempt == "number" ? rawAttempt : Number(rawAttempt);
    if (!Number.isFinite(attempt) || !this.connectAttempts.has(attempt)) {
      // stale or unrelated reply -- ignore
      return;
    }
    this.connectAttempts.clear();
    this.cancelLegacyConnectProbe();
    this.setState("ready");
    this.alive?.recv();
    this.initKeepAlive();
  };

  private getServerId = async () => {
    let id;
    if (this.loadBalancer != null) {
      logger.debug("getting server id from load balancer");
      id = await this.loadBalancer(this.subject);
      this.serverId = id;
      return;
    }

    // Local retry loop, deliberately NOT using waitForInterest:
    //
    // Without retry, run() calls getServerId() -> core request publishes
    // -> sees count == 0 (server hasn't started listening yet) -> throws
    // 503 immediately -> run() catches -> disconnect() schedules a
    // reconnect after RECONNECT_DELAY (500ms). The "client created
    // before server" pattern in basic.test.ts then loses most of a
    // small request budget to that reconnect penalty.  Particularly
    // visible when perMessageDeflate is off, since the deflate
    // extension's async send pipeline previously masked the timing.
    //
    // An earlier attempt wrapped this in waitForInterest(statusSubject)
    // with backoff polling, mirroring cocalc-ai/main.  In our cluster
    // tests that introduces a 1/8 stress flake.  Root cause: clustered
    // waitForInterestInLinks() races a local interest check against
    // remote-link interest checks and returns the first answer, even
    // a `false` from the local check (see core/server.ts
    // waitForInterestInLinks).  With a short per-attempt timeout, the
    // local "no interest" branch can win and abort the remote-link
    // waiter before remote interest is observed, perturbing
    // cross-node socket selection in exactly the cluster.test we saw.
    // Doing the retry locally on the request itself avoids that: each
    // attempt is a normal core request, the 503 fast-path returns
    // immediately when there's no responder, and we just sleep and
    // retry without involving the cluster interest layer.
    //
    // Bound the loop on this.state == "connecting" so disconnect /
    // close tears it down.  Per-attempt timeout is short so a hang on
    // a half-connected server doesn't burn the whole reconnect budget
    // on one request.
    let delayMs = 50;
    while (this.state == "connecting") {
      try {
        logger.debug("getting server id from socket server");
        const resp = await this.client.request(
          serverStatusSubject(this.subject),
          null,
          { timeout: 500 },
        );
        if (this.state != "connecting") {
          return;
        }
        this.serverId = resp.data.id;
        return;
      } catch (err) {
        // 503 = no responder yet (server not listening); retry.
        // 408 = our short timeout fired; retry.
        // anything else: surface to run(), which will disconnect+reconnect.
        const code = (err as any)?.code;
        if (code !== 503 && code !== 408) {
          throw err;
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(500, Math.round(delayMs * 1.3));
    }
  };

  // Drives the client subscription loop.  Started concurrently with
  // waitForConnected() so we are already consuming the subscription before
  // the server's `connected` control message arrives.
  private processMessages = async () => {
    if (this.sub == null) {
      return;
    }
    for await (const mesg of this.sub) {
      if ((this.state as any) == "closed") {
        return;
      }
      this.alive?.recv();
      const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
      if (cmd) {
        logger.silly("client got cmd", cmd);
      }
      if (cmd == "connected") {
        this.handleConnected(mesg);
      } else if (cmd == "socket") {
        this.tcp?.send.handleRequest(mesg);
      } else if (cmd == "close") {
        this.flushDataQueue();
        this.close();
        return;
      } else if (cmd == "ping") {
        mesg.respondSync(null);
      } else if (mesg.isRequest()) {
        // Flush any pending data events first so the request handler
        // sees them in order, not after the request.
        this.flushDataQueue();
        this.emit("request", mesg);
      } else {
        this.tcp?.recv.process(mesg);
      }
    }
  };

  // Backoff loop: publish a `connect` control message and wait up to
  // `timeoutMs` for the matching `connected` reply (which lands in
  // processMessages and flips state to "ready").  If we time out, retry
  // with a longer budget.
  //
  // Only loop while state == "connecting".  If base.disconnect() flipped
  // us to "disconnected", reconnect logic in base will start a fresh
  // connect via base.connect() which calls run() again -- this loop must
  // not keep publishing on a torn-down attempt.
  private waitForConnected = async () => {
    let timeoutMs = 500;
    while (this.state == "connecting") {
      this.sendConnectCommand();
      try {
        await once(this, "ready", timeoutMs);
        return;
      } catch {
        // timed out waiting for `connected` -- retry with backoff
      }
      timeoutMs = Math.min(10_000, Math.round(timeoutMs * 1.3));
    }
  };

  protected async run() {
    if (this.state == "closed") {
      return;
    }
    // Drop any stale connect-attempt ids from a previous session so a late
    // `connected` reply for an aborted attempt cannot mark this session
    // ready prematurely.
    this.connectAttempts.clear();
    this.cancelLegacyConnectProbe();
    try {
      await this.getServerId();
      if (this.serverId == null) {
        // closed/disconnected mid-getServerId
        return;
      }
      logger.silly("run: getting subscription");
      // subscribeSync so we are already buffering inbound messages by the
      // time we publish the `connect` control message.  The server's
      // `connected` reply must not be missed.
      this.sub = this.client.subscribeSync(`${this.subject}.client.${this.id}`);
      // @ts-ignore
      if (this.state == "closed") {
        this.sub.close();
        return;
      }
      // Start consuming the subscription concurrently with the connect
      // handshake so the `connected` reply is processed when it arrives.
      const messagesDone = this.processMessages();
      await this.waitForConnected();
      if ((this.state as any) != "ready") {
        throw Error("failed to connect");
      }
      await messagesDone;
    } catch (err) {
      logger.silly("socket connect failed", err);
      this.disconnect();
    }
  }

  private sendDataToServer = (mesg) => {
    this.client.publishSync(this.serverSubject(), null, {
      raw: mesg.raw,
      headers: mesg.headers,
    });
  };

  private sendToServer = (mesg) => {
    if (this.state != "ready") {
      this.queuedWrites.push(mesg);
      while (this.queuedWrites.length > this.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    // @ts-ignore
    if (this.state == "closed") {
      throw Error("closed");
    }
    if (this.role == "server") {
      throw Error("sendToServer is only for use by the client");
    } else {
      // we are the client, so write to server
      this.sendDataToServer(mesg);
    }
  };

  request = async (data, options?) => {
    await this.waitUntilReady(options?.timeout);
    if (this.state == "closed") {
      throw Error("closed");
    }
    // console.log("sending request from client ", { subject, data, options });
    return await this.client.request(this.serverSubject(), data, options);
  };

  requestMany = async (data, options?): Promise<Subscription> => {
    await this.waitUntilReady(options?.timeout);
    return await this.client.requestMany(this.serverSubject(), data, options);
  };

  async end({ timeout = 3000 }: { timeout?: number } = {}) {
    if (this.state == "closed") {
      return;
    }
    this.reconnection = false;
    this.ended = true;
    // tell server we're done
    try {
      await this.sendCommandToServer("close", timeout);
    } catch {}
    this.close();
  }

  close() {
    if (this.state == "closed") {
      return;
    }
    this.flushDataQueue();
    this.connectAttempts.clear();
    this.cancelLegacyConnectProbe();
    this.sub?.close();
    if (this.tcp != null) {
      this.client.removeListener(
        "disconnected",
        this.tcp.send.resendLastUntilAcked,
      );
    }
    this.queuedWrites = [];
    // tell server we're gone (but don't wait)
    (async () => {
      try {
        await this.sendCommandToServer("close");
      } catch {}
    })();
    if (this.tcp != null) {
      this.tcp.send.close();
      this.tcp.recv.close();
      // @ts-ignore
      delete this.tcp;
    }
    this.alive?.close();
    delete this.alive;
    super.close();
  }

  // writes will raise an exception if: (1) the socket is closed code='EPIPE', or (2)
  // you hit maxQueueSize un-ACK'd messages, code='ENOBUFS'
  write = (data, { headers }: { headers?: Headers } = {}): void => {
    // @ts-ignore
    if (this.state == "closed") {
      throw new ConatError("closed", { code: "EPIPE" });
    }
    const mesg = messageData(data, { headers });
    this.tcp?.send.process(mesg);
  };

  iter = () => {
    return new EventIterator<[any, Headers]>(this, "data");
  };
}
