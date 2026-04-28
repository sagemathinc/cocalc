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

export class ConatSocketClient extends ConatSocketBase {
  queuedWrites: { data: any; headers?: Headers }[] = [];
  private tcp?: TCP;
  private alive?: KeepAlive;
  private serverId?: string;
  private loadBalancer?: (subject:string) => Promise<string>;
  // For the connect-control handshake: each connect attempt gets a unique id
  // we tag onto the publish so the matching `connected` reply can be
  // correlated.  Not strictly required for correctness today but lets us
  // ignore stale `connected` replies after disconnect+reconnect.
  private nextConnectAttemptId = 0;
  private connectAttempts = new Set<number>();

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
      this.emit("data", mesg.data, mesg.headers);
    });
    this.tcp.send.on("drain", () => {
      this.emit("drain");
    });
  }

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

  // Fire-and-forget publish of a `connect` control message to the server.
  // The reply (`connected`) lands on the client subject we already
  // subscribed to, and is handled by handleConnected below.
  private sendConnectCommand = () => {
    const attempt = this.nextConnectAttemptId++;
    this.connectAttempts.add(attempt);
    const subject = this.serverSubject();
    logger.silly("sendConnectCommand", { attempt, subject });
    this.client.publishSync(subject, null, {
      headers: {
        [SOCKET_HEADER_CMD]: "connect",
        [SOCKET_HEADER_CONNECT_ATTEMPT]: attempt,
        id: this.id,
      },
    });
  };

  private handleConnected = (mesg) => {
    if (this.state == "ready" || this.state == "closed") {
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
    this.setState("ready");
    this.alive?.recv();
    this.initKeepAlive();
  };

  private getServerId = async () => {
    let id;
    if (this.loadBalancer != null) {
      logger.debug("getting server id from load balancer");
      id = await this.loadBalancer(this.subject);
    } else {
      logger.debug("getting server id from socket server");
      const resp = await this.client.request(
        serverStatusSubject(this.subject),
        null,
      );
      ({ id } = resp.data);
    }
    this.serverId = id;
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
        this.close();
        return;
      } else if (cmd == "ping") {
        mesg.respondSync(null);
      } else if (mesg.isRequest()) {
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
  private waitForConnected = async () => {
    let timeoutMs = 500;
    while (
      (this.state as any) != "closed" &&
      (this.state as any) != "ready"
    ) {
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
    try {
      await this.getServerId();
      logger.silly("run: getting subscription");
      // subscribeSync so we are already buffering inbound messages by the
      // time we publish the `connect` control message.  The server's
      // `connected` reply must not be missed.
      this.sub = this.client.subscribeSync(
        `${this.subject}.client.${this.id}`,
      );
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
    this.connectAttempts.clear();
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
