import {
  messageData,
  type Subscription,
  type Headers,
} from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ConatSocketBase } from "./base";
import { type TCP, createTCP } from "./tcp";
import {
  PING_PONG_INTERVAL,
  SOCKET_HEADER_CMD,
  DEFAULT_TIMEOUT,
  type ConatSocketOptions,
} from "./util";
import { delay } from "awaiting";
import { EventIterator } from "@cocalc/util/event-iterator";

export class ConatSocketClient extends ConatSocketBase {
  queuedWrites: { data: any; headers?: Headers }[] = [];

  private tcp: TCP;

  constructor(opts: ConatSocketOptions) {
    super(opts);
    this.initTCP();
    this.on("ready", () => {
      for (const mesg of this.queuedWrites) {
        this.sendDataToServer(mesg);
      }
    });
    this.client.on("connected", this.tcp.send.resendLastUntilAcked);
  }

  channel(channel: string) {
    return new ConatSocketClient({
      subject: this.subject + "." + channel,
      client: this.client,
      role: this.role,
      id: this.id,
      maxQueueSize: this.maxQueueSize,
    }) as ConatSocketClient;
  }

  private initTCP = () => {
    if (this.role == "server") {
      // tcp for the server is on each individual socket.
      return;
    }
    // request = send a socket request mesg to the server ack'ing or
    // asking for a resend of missing data.
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
    });

    this.tcp.recv.on("message", (mesg) => {
      this.emit("data", mesg.data, mesg.headers);
    });
  };

  private sendCommandToServer = async (
    cmd: "close" | "ping" | "connect",
    mesg?,
    timeout?,
  ) => {
    const headers = {
      [SOCKET_HEADER_CMD]: cmd,
      id: this.id,
    };
    const subject = `${this.subject}.server.${this.id}`;
    const resp = await this.client.request(subject, mesg ?? null, {
      headers,
      timeout: timeout ?? DEFAULT_TIMEOUT,
    });
    const value = resp.data;
    if (value?.error) {
      throw Error(value?.error);
    } else {
      return value;
    }
  };

  protected async run() {
    // console.log("subscribing to ", `${this.subject}.client.${this.id}`);
    try {
      this.sub = await this.client.subscribe(
        `${this.subject}.client.${this.id}`,
      );
      if (this.state == "closed") {
        return;
      }
      const resp = await this.sendCommandToServer("connect", null);
      if (resp != "connected") {
        throw Error("failed to connect");
      }
      this.setState("ready");
      this.clientPing();
      for await (const mesg of this.sub) {
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd == "socket") {
          this.tcp?.send.handleRequest(mesg);
        } else if (cmd == "close") {
          this.disconnect();
          return;
        } else if (mesg.isRequest()) {
          this.emit("request", mesg);
        } else {
          this.tcp?.recv.process(mesg);
        }
      }
    } catch {
      this.disconnect();
    }
  }

  // we send pings to the server and it responds with a pong.
  // if response fails, reconnect.
  private clientPing = reuseInFlight(async () => {
    while (this.state != "closed") {
      if (this.state == "ready") {
        try {
          // console.log("client: sending a ping");
          const x = await this.sendCommandToServer("ping");
          // console.log("client: sending a ping got back ", x);
          if (x != "pong") {
            throw Error("ping failed");
          }
        } catch (err) {
          // console.log("client: sending a ping error ", err);
          //console.log("ping failed");
          // if sending ping fails, disconnect
          this.disconnect();
          return;
        }
      }
      // console.log("waiting ", PING_PONG_INTERVAL);
      await delay(PING_PONG_INTERVAL);
    }
  });

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
      await this.sendCommandToServer("close", undefined, timeout);
    } catch {}
    this.close();
  }

  close() {
    if (this.state == "closed") {
      return;
    }
    this.client.removeListener("connected", this.tcp.send.resendLastUntilAcked);
    this.queuedWrites = [];
    // tell server we're gone (but don't wait)
    (async () => {
      try {
        await this.sendCommandToServer("close");
      } catch {}
    })();
    this.tcp.send.close();
    this.tcp.recv.close();
    // @ts-ignore
    delete this.tcp;
    super.close();
  }

  write = (data, { headers }: { headers?: Headers } = {}): void => {
    // @ts-ignore
    if (this.state == "closed") {
      throw Error("closed");
    }
    const mesg = messageData(data, { headers });
    this.tcp?.send.process(mesg);
  };

  iter = () => {
    return new EventIterator<[any, Headers]>(this, "data");
  };
}
