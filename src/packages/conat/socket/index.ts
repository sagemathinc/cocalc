/*
SUBJECT BASED SOCKETS

In compute networking TCP and Web sockets are a great idea!  They are 
incredibly useful as an abstraction.   A drawback is that to create
a socket you need to define a port, ip address and have a client
and server that are on a common network, so the cliet can connect to 
the server.  On the other hand, conat's pub/sub model lets you
instead have all clients/servers connect to a common "fabric"
and publish and subscribe using subject patterns and subjects.
This is extremley nice because there's no notion of ip addresses,
and clients and servers do not have to be directly connected to
each other.

**The TCP protocol for sockets guarantees **in-order, reliable, and 
lossless transmission of messages between sender and receiver.**
That same guarantee is thus what we support with our socket abstraction.

This module provides an emulation of sockets but on top of the
conat pub/sub model.  The server and clients agree on a common
*subject* pattern of the form `${subject}.>` that they both 
have read/write permissions for.  Then the server listens for 
new socket connections from clients.  Sockets get setup and
the server can write to each one, they can write to the server,
and the server can broadcast to all connected sockets.
There are heartbeats to keep everything alive. When a client
or server properly closes a connection, the other side gets
immediately notified.  

Of course you can also send arbitrary messages over the socket.

LOAD BALANCING AND AUTOMATIC FAILOVER:

We use a *sticky* subscription on the server's side.  This means 
you can have several distinct socket servers for the same subject,
and connection will get distributed between them, but once a connection
is created, it will persist in the expected way (i.e., the socket 
connects with exactly one choice of server).  You can dynamically 
add and remove servers at any time.  You get stateful automatic
load balancing and automatic across all of them.

HEADERS ARE FULLY SUPPORTED:

If you just use s.write(data) and s.on('data', (data)=>) then 
you get the raw data without headers.  However, headers -- arbitrary
JSON separate from the raw (possibly binary) payload -- are supported.
You just have to pass a second argument: 
    s.write(data, headers) and s.on('data', (data,headers) => ...)

UNIT TESTS:

For unit tests, see

   backend/conat/test/socket/conat-socket.test.ts
    
WARNING:

If you create a socket server on with a given subject, then
it will use `${subject}.server.*` and `${subject}.client.*`, so
don't use `${subject}.>` for anything else!


DEVELOPMENT:

Start node via 

CONAT_SERVER=http://localhost:3000 node

// conat socketio server

s = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0


// server side of socket

conat = await require('@cocalc/backend/conat').conat(); s = conat.socket.listen('conat.io');s.on('connection',(socket)=>{
    console.log("got new connection", socket.id);
    socket.on('data',(data) => console.log("got", {data})); 
    socket.on('request', (mesg)=>{console.log("responding..."); mesg.respond('foo')})
});0

// client side of socket

conat = await require('@cocalc/backend/conat').conat(); c = conat.socket.connect('conat.io');c.on('data',(data) => console.log("got", {data}));0

c.write('hi')


*/

import { EventEmitter } from "events";
import {
  type Client,
  type Headers,
  type Subscription,
  DEFAULT_REQUEST_TIMEOUT,
  messageData,
} from "@cocalc/conat/core/client";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { SOCKET_HEADER_CMD, type State } from "./util";
import { ReceiverTCP, SenderTCP } from "./tcp";
import { ServerSocket } from "./server-socket";
export { type ServerSocket };

export type Role = "client" | "server";

// client pings server this frequently and disconnects if
// doesn't get a pong back.  Server disconnects client if
// it doesn't get a ping as well.  This is NOT the primary
// keep alive/disconnect mechanism -- it's just a backup.
// Primarily we watch the connect/disconnect events from
// socketio and use those to manage things.  This ping
// is entirely a "just in case" backup if some event
// were missed (e.g., a kill -9'd process...)
const PING_PONG_INTERVAL = 60000;

// We queue up unsent writes, but only up to a point (to not have a huge memory issue).
// Any write beyond the last this many are discarded:
const DEFAULT_MAX_QUEUE_SIZE = 100;

const DEFAULT_TIMEOUT = 7500;

type Command = "connect" | "close" | "ping" | "socket";

export interface ConatSocketOptions {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  maxQueueSize?: number;
  // (Default: true) Whether reconnection is enabled or not.
  // If set to false, you need to manually reconnect:
  reconnection?: boolean;
  // sent as body of message by client when initially connecting,
  // and delivered as a write (avoids a round trip to initialize)
  init?: any;
}

const connections: { [key: string]: ConatSocket } = {};
export function getConatSocketConnection(
  opts: ConatSocketOptions,
): ConatSocket {
  const key = getKey(opts);
  if (connections[key] == null) {
    connections[key] = createConatSocket(opts);
  }
  return connections[key];
}

function getKey({ subject, role, id }: ConatSocketOptions) {
  return JSON.stringify([subject, role, id]);
}

abstract class ConatSocketBase extends EventEmitter {
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
  init: any;
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
    init,
  }: ConatSocketOptions) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.reconnection = reconnection;
    this.subject = subject;
    this.client = client;
    this.client.on("closed", this.close);
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.init = init;
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
    this.client.removeListener("closed", this.close);

    this.setState("closed");
    this.removeAllListeners();

    delete connections[getKey(this)];
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

export class ConatSocketClient extends ConatSocketBase {
  queuedWrites: { data: any; headers?: Headers }[] = [];

  private tcp: {
    send: SenderTCP;
    recv: ReceiverTCP;
  };

  constructor(opts: ConatSocketOptions) {
    super(opts);
    this.initTCP();
    this.on("ready", () => {
      for (const mesg of this.queuedWrites) {
        this.sendDataToServer(mesg);
      }
    });
  }

  channel(channel: string) {
    return getConatSocketConnection({
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

    this.tcp = {
      send: new SenderTCP(this.sendToServer),
      recv: new ReceiverTCP(request, this.disconnect),
    };
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
      const resp = await this.sendCommandToServer("connect", this.init);
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
    // console.log("sending request to subject ", subject);
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
}

export class ConatSocketServer extends ConatSocketBase {
  channel(channel: string) {
    return getConatSocketConnection({
      subject: this.subject + "." + channel,
      client: this.client,
      role: this.role,
      id: this.id,
    }) as ConatSocketServer;
  }

  forEach = (f: (socket: ServerSocket, id: string) => void) => {
    for (const id in this.sockets) {
      f(this.sockets[id], id);
    }
  };

  protected async run() {
    this.deleteDeadSockets();
    const sub = await this.client.subscribe(`${this.subject}.server.*`, {
      sticky: true,
      ephemeral: true,
    });
    if (this.state == "closed") {
      sub.close();
      return;
    }
    this.sub = sub;
    this.setState("ready");
    for await (const mesg of this.sub) {
      // console.log("got mesg", mesg.data, mesg.headers);
      if (this.state == ("closed" as any)) {
        return;
      }
      const id = mesg.subject.split(".").slice(-1)[0];
      let socket = this.sockets[id];
      if (socket === undefined) {
        // new connection
        socket = new ServerSocket({
          conatSocket: this,
          id,
          subject: mesg.subject,
        });
        this.sockets[id] = socket;
        this.emit("connection", socket);
      }
      const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
      if (cmd !== undefined) {
        // note: test this first since it is also a request
        // a special internal control command
        this.handleCommandFromClient({ socket, cmd: cmd as Command, mesg });
      } else if (mesg.isRequest()) {
        // a request to support the socket.on('request', (mesg) => ...) protocol:
        socket.emit("request", mesg);
      } else {
        socket.receiveDataFromClient(mesg);
      }
    }
  }

  private async deleteDeadSockets() {
    while (this.state != "closed") {
      for (const id in this.sockets) {
        const socket = this.sockets[id];
        if (Date.now() - socket.lastPing > PING_PONG_INTERVAL * 2.5) {
          socket.destroy();
        }
      }
      await delay(PING_PONG_INTERVAL);
    }
  }

  request = async (data, options?) => {
    await this.waitUntilReady(options?.timeout);

    // we call all connected sockets in parallel,
    // then return array of responses.
    // Unless race is set, then we return first result
    const v: any[] = [];
    for (const id in this.sockets) {
      const f = async () => {
        if (this.state == "closed") {
          throw Error("closed");
        }
        try {
          return await this.sockets[id].request(data, options);
        } catch (err) {
          return err;
        }
      };
      v.push(f());
    }
    if (options?.race) {
      return await Promise.race(v);
    } else {
      return await Promise.all(v);
    }
  };

  write = (data, { headers }: { headers?: Headers } = {}): void => {
    // @ts-ignore
    if (this.state == "closed") {
      throw Error("closed");
    }
    // write to all the sockets that are connected.
    for (const id in this.sockets) {
      this.sockets[id].write(data, headers);
    }
  };

  handleCommandFromClient = ({
    socket,
    cmd,
    mesg,
  }: {
    socket: ServerSocket;
    cmd: Command;
    mesg;
  }) => {
    socket.lastPing = Date.now();
    if (cmd == "socket") {
      socket.tcp.send.handleRequest(mesg);
    } else if (cmd == "ping") {
      mesg.respond("pong");
    } else if (cmd == "close") {
      const id = socket.id;
      socket.close();
      delete this.sockets[id];
      mesg.respond("closed");
    } else if (cmd == "connect") {
      const data = mesg.data;
      if (data != null) {
        // data of connect message can be used to initialize the socket.
        socket.emit("data", data);
      }
      mesg.respond("connected");
    } else {
      mesg.respond({ error: `unknown command - '${cmd}'` });
    }
  };

  async end({ timeout = 3000 }: { timeout?: number } = {}) {
    if (this.state == "closed") {
      return;
    }
    this.reconnection = false;
    this.ended = true;
    // tell all clients to end
    const end = async (id) => {
      const socket = this.sockets[id];
      delete this.sockets[id];
      try {
        await socket.end({ timeout });
      } catch (err) {
        console.log("WARNING: error ending socket -- ${err}");
      }
    };
    await Promise.all(Object.keys(this.sockets).map(end));
    this.close();
  }
}

export type ConatSocket = ConatSocketClient | ConatSocketServer;

function createConatSocket(opts: ConatSocketOptions) {
  if (opts.role == "client") {
    return new ConatSocketClient(opts);
  } else if (opts.role == "server") {
    return new ConatSocketServer(opts);
  } else {
    throw Error("role must be client or server");
  }
}
