import { EventEmitter } from "events";
import {
  type Headers,
  DEFAULT_REQUEST_TIMEOUT,
  type Message,
  messageData,
} from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { SOCKET_HEADER_CMD, type State } from "./util";
import { ReceiverTCP, SenderTCP } from "./tcp";
import { type ConatSocket } from "./index";

// One specific socket from the point of view of a server.
export class ServerSocket extends EventEmitter {
  private conatSocket: ConatSocket;
  public readonly id: string;
  public lastPing = Date.now();

  private queuedWrites: { data: any; headers?: Headers }[] = [];
  private clientSubject: string;

  public state: State = "ready";
  // the non-pattern subject the client connected to
  public readonly subject: string;

  // this is just for compat with conatSocket api:
  public readonly address = { ip: "" };
  // conn is just for compatibility with primus/socketio (?).
  public readonly conn: { id: string };

  public tcp: {
    send: SenderTCP;
    recv: ReceiverTCP;
  };

  constructor({ conatSocket, id, subject }) {
    super();
    this.subject = subject;
    this.conatSocket = conatSocket;
    const segments = subject.split(".");
    segments[segments.length - 2] = "client";
    this.clientSubject = segments.join(".");
    this.id = id;
    this.conn = { id };
    this.initTCP();
  }

  private initTCP = () => {
    const request = async (mesg, opts?) =>
      await this.conatSocket.client.request(this.clientSubject, mesg, {
        ...opts,
        headers: { ...opts?.headers, [SOCKET_HEADER_CMD]: "socket" },
      });

    this.tcp = {
      send: new SenderTCP(this.send),
      recv: new ReceiverTCP(request, this.close),
    };
    this.tcp.recv.on("message", (mesg) => {
      // console.log("tcp recv emitted message", mesg.data);
      this.emit("data", mesg.data, mesg.headers);
    });
  };

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const { data, headers } of this.queuedWrites) {
        this.write(data, { headers });
        this.queuedWrites = [];
      }
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
    try {
      this.conatSocket.client.publishSync(this.clientSubject, null, {
        headers: { [SOCKET_HEADER_CMD]: "close" },
      });
    } catch {}
    if (this.tcp != null) {
      this.tcp.send.close();
      this.tcp.recv.close();
      // @ts-ignore
      delete this.tcp;
    }
    this.queuedWrites = [];
    this.setState("closed");
    this.removeAllListeners();
    delete this.conatSocket.sockets[this.id];
  };

  receiveDataFromClient = (mesg) => {
    this.tcp.recv.process(mesg);
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

  write = (data, { headers }: { headers?: Headers } = {}) => {
    const mesg = messageData(data, { headers });
    this.tcp.send.process(mesg);
  };

  // use request reply where the client responds
  request = async (data, options?) => {
    this.waitUntilReady(options?.timeout);
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
}
