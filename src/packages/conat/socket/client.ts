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
  DEFAULT_COMMAND_TIMEOUT,
  type ConatSocketOptions,
} from "./util";
import { EventIterator } from "@cocalc/util/event-iterator";
import { keepAlive, KeepAlive } from "./keepalive";
import { getLogger } from "@cocalc/conat/client";
import { until } from "@cocalc/util/async-utils";

const logger = getLogger("socket:client");

// DO NOT directly instantiate here -- instead, call the
// socket.connect method on ConatClient.

export class ConatSocketClient extends ConatSocketBase {
  queuedWrites: { data: any; headers?: Headers }[] = [];
  private tcp?: TCP;
  private alive?: KeepAlive;

  constructor(opts: ConatSocketOptions) {
    super(opts);
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
      this.client.removeListener(
        "connected",
        this.tcp.send.resendLastUntilAcked,
      );
      this.tcp.send.close();
      this.tcp.recv.close();
    }
    // request = send a socket request mesg to the server side of the socket
    // either ack what's received or asking for a resend of missing data.
    const request = async (mesg, opts?) =>
      await this.client.request(`${this.subject}.server.${this.id}`, mesg, {
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

    this.client.on("connected", this.tcp.send.resendLastUntilAcked);

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
    cmd: "close" | "ping" | "connect",
    timeout = DEFAULT_COMMAND_TIMEOUT,
  ) => {
    logger.silly("sendCommandToServer", { cmd, timeout });
    const headers = {
      [SOCKET_HEADER_CMD]: cmd,
      id: this.id,
    };
    const subject = `${this.subject}.server.${this.id}`;
    const resp = await this.client.request(subject, null, {
      headers,
      timeout,
    });
    const value = resp.data;
    logger.silly("sendCommandToServer: got resp", { cmd, value });
    if (value?.error) {
      throw Error(value?.error);
    } else {
      return value;
    }
  };

  protected async run() {
    if (this.state == "closed") {
      return;
    }
    //     console.log(
    //       "client socket -- subscribing to ",
    //       `${this.subject}.client.${this.id}`,
    //     );
    try {
      logger.silly("run: getting subscription");
      this.sub = await this.client.subscribe(
        `${this.subject}.client.${this.id}`,
      );
      // @ts-ignore
      if (this.state == "closed") {
        return;
      }
      let resp: any = undefined;
      await until(
        async () => {
          if (this.state == "closed") {
            logger.silly("closed -- giving up on connecting");
            return true;
          }
          try {
            logger.silly("sending connect command to server");
            resp = await this.sendCommandToServer("connect");
            this.alive?.recv();
            return true;
          } catch (err) {
            logger.silly("failed to connect", err);
          }
          return false;
        },
        { start: 500, decay: 1.3, max: 10000 },
      );

      if (resp != "connected") {
        throw Error("failed to connect");
      }
      this.setState("ready");
      this.initKeepAlive();
      for await (const mesg of this.sub) {
        this.alive?.recv();
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd) {
          logger.silly("client got cmd", cmd);
        }
        if (cmd == "socket") {
          this.tcp?.send.handleRequest(mesg);
        } else if (cmd == "close") {
          this.disconnect();
          return;
        } else if (cmd == "ping") {
          logger.silly("responding to ping from server", this.id);
          mesg.respond(null);
        } else if (mesg.isRequest()) {
          logger.silly("client got request");
          this.emit("request", mesg);
        } else {
          logger.silly("client got data", { data: mesg.data });
          this.tcp?.recv.process(mesg);
        }
      }
    } catch (err) {
      logger.silly("socket connect failed", err);
      this.disconnect();
    }
  }

  private sendDataToServer = (mesg) => {
    const subject = `${this.subject}.server.${this.id}`;
    this.client.publishSync(subject, null, {
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
    const subject = `${this.subject}.server.${this.id}`;
    if (this.state == "closed") {
      throw Error("closed");
    }
    // console.log("sending request from client ", { subject, data, options });
    return await this.client.request(subject, data, options);
  };

  requestMany = async (data, options?): Promise<Subscription> => {
    await this.waitUntilReady(options?.timeout);
    const subject = `${this.subject}.server.${this.id}`;
    return await this.client.requestMany(subject, data, options);
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
    this.sub?.close();
    if (this.tcp != null) {
      this.client.removeListener(
        "connected",
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
