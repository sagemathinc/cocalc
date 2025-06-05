import { EventEmitter } from "events";
import {
  type Client,
  type Subscription,
  DEFAULT_REQUEST_TIMEOUT,
} from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import {
  type Role,
  type State,
  DEFAULT_MAX_QUEUE_SIZE,
  type ConatSocketOptions,
} from "./util";
import { type ServerSocket } from "./server-socket";

export abstract class ConatSocketBase extends EventEmitter {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  subscribe: string;
  sockets: { [id: string]: ServerSocket } = {};
  subjects: {
    server: string;
    client: string;
  };

  sub?: Subscription;
  state: State = "disconnected";
  reconnection: boolean;
  ended: boolean = false;
  maxQueueSize: number;

  // the following is all for compat with primus's api and has no meaning here.
  address = { ip: "" };
  conn: { id: string };
  OPEN = 1;
  CLOSE = 0;
  readyState: 0;
  // end compat

  constructor({
    subject,
    client,
    role,
    id,
    reconnection = true,
    maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  }: ConatSocketOptions) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.reconnection = reconnection;
    this.subject = subject;
    this.client = client;
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.connect();
  }

  abstract channel(channel: string);

  protected abstract run();

  abstract end(opts: { timeout?: number });

  protected setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  destroy = () => this.close();

  close() {
    if (this.state == "closed") {
      return;
    }
    this.setState("closed");
    this.removeAllListeners();

    this.sub?.close();
    delete this.sub;
    for (const id in this.sockets) {
      this.sockets[id].destroy();
    }
    this.sockets = {};
    // @ts-ignore
    delete this.client;
  }

  disconnect = () => {
    if (this.state == "closed") {
      return;
    }
    this.setState("disconnected");
    this.sub?.close();
    delete this.sub;
    for (const id in this.sockets) {
      this.sockets[id].destroy();
    }
    this.sockets = {};
    if (this.reconnection) {
      setTimeout(this.connect, 1000);
    }
  };

  connect = async () => {
    if (this.state != "disconnected") {
      // already connected
      return;
    }
    this.setState("connecting");
    try {
      await this.run();
    } catch (err) {
      console.log(`WARNING: ${this.role} socket connect error -- ${err}`);
      this.disconnect();
    }
  };

  // usually all the timeouts are the same, so this reuseInFlight is very helpful
  waitUntilReady = reuseInFlight(async (timeout?: number) => {
    if (this.state == "ready") {
      return;
    }
    await once(this, "ready", timeout ?? DEFAULT_REQUEST_TIMEOUT);
    if (this.state == "closed") {
      throw Error("closed");
    }
  });
}
