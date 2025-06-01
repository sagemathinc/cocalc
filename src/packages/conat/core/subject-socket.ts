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

    packages/backend/conat/test/subject-socket.test.ts
    
WARNING:

If you create a socket server on with a given subject, then
it will use `${subject}.server.*` and `${subject}.client.*`, so
don't use `${subject}.>` for anything else!

*/

import { EventEmitter } from "events";
import { type Client, type Subscription } from "@cocalc/conat/core/client";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { JSONValue } from "@cocalc/util/types";

const SOCKET_HEADER_CMD = "CN-Socket-Cmd";

export type Role = "client" | "server";

// clients send a heartbeat to the server this frequently.
const HEARBEAT_INTERVAL = 60000;

// We queue up unsent writes, but only up to a point (to not have a huge memory issue).
// Any write beyond the last this many are discarded:
const DEAFULT_MAX_QUEUE_SIZE = 100;

type Command = "connect" | "close" | "ping";

export interface SubjectSocketOptions {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  maxQueueSize?: number;
}

const connections: { [key: string]: SubjectSocket } = {};
export function getSubjectSocketConnection(
  opts: SubjectSocketOptions,
): SubjectSocket {
  const key = getKey(opts);
  if (connections[key] == null) {
    connections[key] = new SubjectSocket(opts);
  }
  return connections[key];
}

function getKey({ subject, role, id }: SubjectSocketOptions) {
  return JSON.stringify([subject, role, id]);
}

type State = "connecting" | "ready" | "closed";

export class SubjectSocket extends EventEmitter {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  subscribe: string;
  sockets: { [id: string]: Socket } = {};
  subjects: {
    server: string;
    client: string;
  };
  // this is just for compat with subjectSocket api:
  address = { ip: "" };
  conn: { id: string };
  sub?: Subscription;
  OPEN = 1;
  CLOSE = 0;
  readyState: 0;
  state: State = "connecting";
  queuedWrites: { data: any; headers?: JSONValue }[] = [];
  maxQueueSize: number;

  constructor({
    subject,
    client,
    role,
    id,
    maxQueueSize = DEAFULT_MAX_QUEUE_SIZE,
  }: SubjectSocketOptions) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.subject = subject;
    this.client = client;
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.run();
  }

  channel = (channel: string) => {
    return getSubjectSocketConnection({
      subject: this.subject + "." + channel,
      client: this.client,
      role: this.role,
      id: this.id,
      maxQueueSize: this.maxQueueSize,
    });
  };

  forEach = (f: (spark, id) => void) => {
    for (const id in this.sockets) {
      f(this.sockets[id], id);
    }
  };

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const { data, headers } of this.queuedWrites) {
        this.write(data, headers);
        this.queuedWrites = [];
      }
    }
    this.emit(state);
  };

  private sendCommandToServer = async (cmd: "close" | "ping" | "connect") => {
    const headers = {
      [SOCKET_HEADER_CMD]: cmd,
      id: this.id,
    };
    const subject = `${this.subject}.server.${this.id}`;
    if (cmd == "close") {
      this.client.publishSync(subject, null, { headers });
    } else {
      const resp = await this.client.request(subject, null, { headers });
      const value = resp.data;
      if (value?.error) {
        throw Error(value?.error);
      } else {
        return value;
      }
    }
  };

  private sendDatatoServer = (data, headers) => {
    const subject = `${this.subject}.server.${this.id}`;
    this.client.publishSync(subject, data, { headers });
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    if (this.role == "client") {
      // tell server we're gone
      this.sendCommandToServer("close");
    }
    this.queuedWrites = [];
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
  };

  end = () => this.close();
  destroy = () => this.close();
  connect = () => {};

  private runAsServer = async () => {
    if (this.role != "server") {
      throw Error("only server can serve");
    }
    this.deleteSockets();
    this.sub = await this.client.subscribe(`${this.subject}.server.*`, {
      sticky: true,
      ephemeral: true,
    });
    this.setState("ready");
    for await (const mesg of this.sub) {
      const id = mesg.subject.split(".").slice(-1)[0];
      let socket = this.sockets[id];
      if (socket === undefined) {
        // new connection
        socket = new Socket({
          subjectSocket: this,
          id,
          subject: mesg.subject,
        });
        this.sockets[id] = socket;
        this.emit("connection", socket);
      }
      const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
      if (cmd !== undefined) {
        this.handleCommandFromClient({ socket, cmd: cmd as Command, mesg });
      } else {
        // incoming data:
        socket.emit("data", mesg.data, mesg.headers);
      }
    }
  };

  handleCommandFromClient = ({
    socket,
    cmd,
    mesg,
  }: {
    socket: Socket;
    cmd: Command;
    mesg;
  }) => {
    socket.lastPing = Date.now();
    if (cmd == "ping") {
      mesg.respond("pong");
    } else if (cmd == "close") {
      const id = socket.id;
      socket.close();
      delete this.sockets[id];
      // do not bother to respond to close
    } else if (cmd == "connect") {
      mesg.respond("connected");
    } else {
      mesg.respond({ error: `unknown command - '${cmd}'` });
    }
  };

  private deleteSockets = async () => {
    while (this.state != "closed") {
      for (const id in this.sockets) {
        const socket = this.sockets[id];
        if (Date.now() - socket.lastPing > HEARBEAT_INTERVAL * 2.5) {
          socket.destroy();
        }
      }
      await delay(HEARBEAT_INTERVAL);
    }
  };

  private reconnect = () => {
    if (this.state == "closed") {
      return;
    }
    this.setState("connecting");
    this.sub?.close();
    delete this.sub;
    for (const id in this.sockets) {
      this.sockets[id].destroy();
    }
    this.sockets = {};
    this.run();
  };

  private run = async () => {
    if (this.role == "server") {
      await this.runAsServer();
    } else {
      await this.runAsClient();
    }
  };

  private runAsClient = async () => {
    if (this.role != "client") {
      throw Error("only client can connect");
    }
    this.sub = await this.client.subscribe(`${this.subject}.client.${this.id}`);
    if (this.state == "closed") {
      return;
    }
    try {
      await this.sendCommandToServer("connect");
      this.setState("ready");
      this.clientPing();
      for await (const mesg of this.sub) {
        if (mesg.headers?.[SOCKET_HEADER_CMD] == "close") {
          this.reconnect();
          return;
        }
        // log("got data");
        this.emit("data", mesg.data, mesg.headers);
      }
    } catch {
      this.reconnect();
    }
  };

  // we send pings to the server and it responds with a pong.
  // if response fails, reconnect.
  private clientPing = reuseInFlight(async () => {
    while (this.state != "closed") {
      if (this.state == "ready") {
        try {
          const x = await this.sendCommandToServer("ping");
          if (x != "pong") {
            this.reconnect();
            return;
          }
        } catch {
          // if sending ping fails, reconnect
          this.reconnect();
          return;
        }
      }
      await delay(HEARBEAT_INTERVAL);
    }
  });

  // client: writes to server
  // server: broadcast to ALL connected clients
  write = (data, headers?): void => {
    if (this.state == "connecting") {
      this.queuedWrites.push({ data, headers });
      while (this.queuedWrites.length > this.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    if (this.state == "closed") {
      return;
    }
    if (this.role == "server") {
      // write to all the sockets that are connected.
      for (const id in this.sockets) {
        this.sockets[id].write(data, headers);
      }
    } else {
      // we are the client, so write to server
      this.sendDatatoServer(data, headers);
    }
  };
}

// only used on the server
export class Socket extends EventEmitter {
  private subjectSocket: SubjectSocket;
  public readonly id: string;
  public lastPing = Date.now();

  private queuedWrites: { data: any; headers?: JSONValue }[] = [];
  private clientSubject: string;

  public state: State = "ready";
  // the non-pattern subject the client connected to
  public readonly subject: string;

  // this is just for compat with subjectSocket api:
  public readonly address = { ip: "" };
  // conn is just for compatibility with primus/socketio (?).
  public readonly conn: { id: string };

  constructor({ subjectSocket, id, subject }) {
    super();
    this.subject = subject;
    this.subjectSocket = subjectSocket;
    const segments = subject.split(".");
    segments[segments.length - 2] = "client";
    this.clientSubject = segments.join(".");
    this.id = id;
    this.conn = { id };
  }

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const { data, headers } of this.queuedWrites) {
        this.write(data, headers);
        this.queuedWrites = [];
      }
    }
    this.emit(state);
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    try {
      this.subjectSocket.client.publishSync(this.clientSubject, null, {
        headers: { [SOCKET_HEADER_CMD]: "close" },
      });
    } catch {}
    this.queuedWrites = [];
    this.setState("closed");
    this.removeAllListeners();
    delete this.subjectSocket.sockets[this.id];
  };
  destroy = () => this.close();
  end = () => this.close();

  write = (data, headers?) => {
    if (this.state == "connecting") {
      this.queuedWrites.push({ data, headers });
      while (this.queuedWrites.length > this.subjectSocket.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    if (this.state == "closed") {
      return;
    }
    this.subjectSocket.client.publishSync(this.clientSubject, data, {
      headers,
    });
    return true;
  };
}
