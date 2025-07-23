import { EventEmitter } from "events";
import {
  type Headers,
  DEFAULT_REQUEST_TIMEOUT,
  type Message,
  messageData,
  ConatError,
} from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { SOCKET_HEADER_CMD, type State, clientSubject } from "./util";
import { type TCP, createTCP } from "./tcp";
import { type ConatSocketServer } from "./server";
import { keepAlive, KeepAlive } from "./keepalive";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("socket:server-socket");

// One specific socket from the point of view of a server.
export class ServerSocket extends EventEmitter {
  private conatSocket: ConatSocketServer;
  public readonly id: string;
  public lastPing = Date.now();

  private queuedWrites: { data: any; headers?: Headers }[] = [];
  public readonly clientSubject: string;

  public state: State = "ready";
  // the non-pattern subject the client connected to
  public readonly subject: string;

  // this is just for compat with conatSocket api:
  public readonly address = { ip: "" };
  // conn is just for compatibility with primus/socketio (?).
  public readonly conn: { id: string };

  public tcp?: TCP;
  private alive?: KeepAlive;

  constructor({ conatSocket, id, subject }) {
    super();
    this.subject = subject;
    this.conatSocket = conatSocket;
    this.clientSubject = clientSubject(subject);
    this.id = id;
    this.conn = { id };
    this.initTCP();
    if (this.tcp == null) {
      throw Error("bug");
    }
    this.initKeepAlive();
  }

  private initKeepAlive = () => {
    this.alive?.close();
    this.alive = keepAlive({
      role: "server",
      ping: async () => {
        await this.request(null, {
          headers: { [SOCKET_HEADER_CMD]: "ping" },
          timeout: this.conatSocket.keepAliveTimeout,
          // waitForInterest is very important in a cluster -- also, obviously
          // if somebody just opened a socket, they probably exist.
          waitForInterest: true,
        });
      },
      disconnect: this.close,
      keepAlive: this.conatSocket.keepAlive,
    });
  };

  initTCP() {
    if (this.tcp != null) {
      throw Error("this.tcp already initialized");
    }
    const request = async (mesg, opts?) =>
      await this.conatSocket.client.request(this.clientSubject, mesg, {
        ...opts,
        headers: { ...opts?.headers, [SOCKET_HEADER_CMD]: "socket" },
      });
    this.tcp = createTCP({
      request,
      role: this.conatSocket.role,
      reset: this.close,
      send: this.send,
      size: this.conatSocket.maxQueueSize,
    });
    this.conatSocket.client.on(
      "disconnected",
      this.tcp.send.resendLastUntilAcked,
    );

    this.tcp.recv.on("message", (mesg) => {
      // console.log("tcp recv emitted message", mesg.data);
      this.emit("data", mesg.data, mesg.headers);
    });
    this.tcp.send.on("drain", () => {
      this.emit("drain");
    });
  }

  disconnect = () => {
    this.setState("disconnected");
    if (this.conatSocket.state == "ready") {
      this.setState("ready");
    } else {
      this.conatSocket.once("ready", this.onServerSocketReady);
    }
  };

  private onServerSocketReady = () => {
    if (this.state != "closed") {
      this.setState("ready");
    }
  };

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const mesg of this.queuedWrites) {
        this.sendDataToClient(mesg);
      }
      this.queuedWrites = [];
    }
    this.emit(state);
  };

  end = async ({ timeout = 3000 }: { timeout?: number } = {}) => {
    if (this.state == "closed") {
      return;
    }
    try {
      await this.conatSocket.client.publish(this.clientSubject, null, {
        headers: { [SOCKET_HEADER_CMD]: "close" },
        timeout,
      });
    } catch (err) {
      console.log(`WARNING: error closing socket - ${err}`);
    }
    this.close();
  };

  destroy = () => this.close();

  close = () => {
    if (this.state == "closed") {
      return;
    }
    this.conatSocket.removeListener("ready", this.onServerSocketReady);
    this.conatSocket.client.publishSync(this.clientSubject, null, {
      headers: { [SOCKET_HEADER_CMD]: "close" },
    });

    if (this.tcp != null) {
      this.conatSocket.client.removeListener(
        "disconnected",
        this.tcp.send.resendLastUntilAcked,
      );
      this.tcp.send.close();
      this.tcp.recv.close();
      // @ts-ignore
      delete this.tcp;
    }

    this.alive?.close();
    delete this.alive;

    this.queuedWrites = [];
    this.setState("closed");
    this.removeAllListeners();
    delete this.conatSocket.sockets[this.id];
    // @ts-ignore
    delete this.conatSocket;
  };

  receiveDataFromClient = (mesg) => {
    this.alive?.recv();
    this.tcp?.recv.process(mesg);
  };

  private sendDataToClient = (mesg) => {
    this.conatSocket.client.publishSync(this.clientSubject, null, {
      raw: mesg.raw,
      headers: mesg.headers,
    });
  };

  private send = (mesg: Message) => {
    if (this.state != "ready") {
      this.queuedWrites.push(mesg);
      while (this.queuedWrites.length > this.conatSocket.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    // @ts-ignore
    if (this.state == "closed") {
      return;
    }
    this.sendDataToClient(mesg);
    return true;
  };

  // writes will raise an exception if: (1) the socket is closed, or (2)
  // you hit maxQueueSize un-ACK'd messages.
  write = (data, { headers }: { headers?: Headers } = {}) => {
    if (this.state == "closed") {
      throw new ConatError("closed", { code: "EPIPE" });
    }
    const mesg = messageData(data, { headers });
    this.tcp?.send.process(mesg);
  };

  // use request reply where the client responds
  request = async (data, options?) => {
    await this.waitUntilReady(options?.timeout);
    logger.silly("server sending request to ", this.clientSubject);
    return await this.conatSocket.client.request(
      this.clientSubject,
      data,
      options,
    );
  };

  private waitUntilReady = reuseInFlight(async (timeout?: number) => {
    if (this.state == "ready") {
      return;
    }
    await once(this, "ready", timeout ?? DEFAULT_REQUEST_TIMEOUT);
    if (this.state == "closed") {
      throw Error("closed");
    }
  });

  waitUntilDrain = async () => {
    await this.tcp?.send.waitUntilDrain();
  };
}
