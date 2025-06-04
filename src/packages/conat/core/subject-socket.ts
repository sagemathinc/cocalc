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

    packages/backend/conat/test/subject-socket.test.ts
    
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
  type Message,
  messageData,
  type MessageData,
} from "@cocalc/conat/core/client";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";

const SOCKET_HEADER_CMD = "CN-SocketCmd";
const SOCKET_HEADER_SEQ = "CN-SocketSeq";

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

export interface SubjectSocketOptions {
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

type State = "disconnected" | "connecting" | "ready" | "closed";

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
  state: State = "disconnected";
  queuedWrites: { data: any; headers?: Headers }[] = [];
  maxQueueSize: number;
  reconnection: boolean;
  ended: boolean = false;
  init: any;
  private tcp?: {
    send: SenderTCP;
    recv: ReceiverTCP;
  };

  constructor({
    subject,
    client,
    role,
    id,
    maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
    reconnection = true,
    init,
  }: SubjectSocketOptions) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.reconnection = reconnection;
    this.subject = subject;
    this.client = client;
    this.client.on("closed", this.close);
    this.client.on("connected", this.connect);
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.init = init;
    this.connect();
    if (this.role == "client") {
      this.tcp = {
        send: new SenderTCP(this.sendToServer),
        recv: new ReceiverTCP(
          async (mesg, opts?) =>
            await this.client.request(
              `${this.subject}.server.${this.id}`,
              mesg,
              {
                ...opts,
                headers: { ...opts?.headers, [SOCKET_HEADER_CMD]: "socket" },
              },
            ),
          this.disconnect,
        ),
      };
      this.tcp.recv.on("message", (mesg) => {
        this.emit("data", mesg.data, mesg.headers);
      });
    }
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
      for (const mesg of this.queuedWrites) {
        this.sendDataToServer(mesg);
      }
    }
    this.emit(state);
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

  end = async ({ timeout = 3000 }: { timeout?: number } = {}) => {
    if (this.state == "closed") {
      return;
    }
    this.reconnection = false;
    this.ended = true;
    if (this.role == "client") {
      // tell server we're done
      try {
        await this.sendCommandToServer("close", undefined, timeout);
      } catch {}
    } else {
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
    }
    this.close();
  };

  destroy = () => this.close();

  close = () => {
    if (this.state == "closed") {
      return;
    }
    if (this.tcp != null) {
      this.tcp.send.close();
      this.tcp.recv.close();
      delete this.tcp;
    }
    this.client.removeListener("closed", this.close);
    this.client.removeListener("disconnected", this.disconnect);
    this.client.removeListener("connected", this.connect);
    if (this.role == "client") {
      // tell server we're gone (but don't wait)
      (async () => {
        try {
          await this.sendCommandToServer("close");
        } catch {}
      })();
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

  private runAsServer = async () => {
    if (this.role != "server") {
      throw Error("only server can serve");
    }
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

  private deleteDeadSockets = async () => {
    while (this.state != "closed") {
      for (const id in this.sockets) {
        const socket = this.sockets[id];
        if (Date.now() - socket.lastPing > PING_PONG_INTERVAL * 2.5) {
          socket.destroy();
        }
      }
      await delay(PING_PONG_INTERVAL);
    }
  };

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
      if (this.role == "server") {
        await this.runAsServer();
      } else {
        await this.runAsClient();
      }
    } catch (err) {
      console.log(`WARNING: socket connect error -- ${err}`);
      this.disconnect();
    }
  };

  private runAsClient = async () => {
    if (this.role != "client") {
      throw Error("only client can connect");
    }
    // console.log("subscribing to ", `${this.subject}.client.${this.id}`);
    this.sub = await this.client.subscribe(`${this.subject}.client.${this.id}`);
    if (this.state == "closed") {
      return;
    }
    try {
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
  };

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

  // client: writes to server
  // server: broadcast to ALL connected clients
  write = (data, { headers }: { headers?: Headers } = {}): void => {
    // @ts-ignore
    if (this.state == "closed") {
      throw Error("closed");
    }
    if (this.role == "server") {
      // write to all the sockets that are connected.
      for (const id in this.sockets) {
        this.sockets[id].write(data, headers);
      }
    } else {
      const mesg = messageData(data, { headers });
      this.tcp?.send.process(mesg);
    }
  };

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

    if (this.role == "server") {
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
    }
    const subject = `${this.subject}.server.${this.id}`;
    if (this.state == "closed") {
      throw Error("closed");
    }
    // console.log("sending request to subject ", subject);
    return await this.client.request(subject, data, options);
  };

  requestMany = async (data, options?): Promise<Subscription> => {
    await this.waitUntilReady(options?.timeout);
    if (this.role == "server") {
      throw Error("requestMany with server not implemented");
    }
    const subject = `${this.subject}.server.${this.id}`;
    return await this.client.requestMany(subject, data, options);
  };

  // usually all the timeouts are the same, so this reuseInFlight is very helpful
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

// only used on the server
export class Socket extends EventEmitter {
  private subjectSocket: SubjectSocket;
  public readonly id: string;
  public lastPing = Date.now();

  private queuedWrites: { data: any; headers?: Headers }[] = [];
  private clientSubject: string;

  public state: State = "ready";
  // the non-pattern subject the client connected to
  public readonly subject: string;

  // this is just for compat with subjectSocket api:
  public readonly address = { ip: "" };
  // conn is just for compatibility with primus/socketio (?).
  public readonly conn: { id: string };

  public readonly tcp: {
    send: SenderTCP;
    recv: ReceiverTCP;
  };

  constructor({ subjectSocket, id, subject }) {
    super();
    this.subject = subject;
    this.subjectSocket = subjectSocket;
    const segments = subject.split(".");
    segments[segments.length - 2] = "client";
    this.clientSubject = segments.join(".");
    this.id = id;
    this.conn = { id };
    this.tcp = {
      send: new SenderTCP(this.send),
      recv: new ReceiverTCP(
        async (mesg, opts?) =>
          await this.subjectSocket.client.request(this.clientSubject, mesg, {
            ...opts,
            headers: { ...opts?.headers, [SOCKET_HEADER_CMD]: "socket" },
          }),
        this.close,
      ),
    };
    this.tcp.recv.on("message", (mesg) => {
      // console.log("tcp recv emitted message", mesg.data);
      this.emit("data", mesg.data, mesg.headers);
    });
  }

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
      await this.subjectSocket.client.publish(this.clientSubject, null, {
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
      this.subjectSocket.client.publishSync(this.clientSubject, null, {
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
    delete this.subjectSocket.sockets[this.id];
  };

  receiveDataFromClient = (mesg) => {
    this.tcp.recv.process(mesg);
  };

  private sendDataToClient = (mesg) => {
    this.subjectSocket.client.publishSync(this.clientSubject, null, {
      raw: mesg.raw,
      headers: mesg.headers,
    });
  };

  private send = (mesg: Message) => {
    if (this.state != "ready") {
      this.queuedWrites.push(mesg);
      while (this.queuedWrites.length > this.subjectSocket.maxQueueSize) {
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
    return await this.subjectSocket.client.request(
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

class ReceiverTCP extends EventEmitter {
  private incoming: { [id: number]: MessageData } = {};
  private seq: {
    // next = seq of the next message we should emit
    next: number;
    // emitted = seq of the last message we actually did emit
    emitted: number;
    // reported = seq of last message we reported received to caller
    reported: number;
    // largest = largest seq of any message we have received
    largest: number;
  } = { next: 1, emitted: 0, reported: 0, largest: 0 };

  constructor(
    private request,
    private disconnect,
  ) {
    super();
  }

  close = () => {
    this.removeAllListeners();
    // @ts-ignore
    delete this.incoming;
    // @ts-ignore
    delete this.seq;
  };

  process = (mesg: MessageData) => {
    const seq = mesg.headers?.[SOCKET_HEADER_SEQ];
    if (typeof seq != "number" || seq < 1) {
      console.log(
        "WARNING: discarding message -- seq must be a positive integer",
        { seq },
      );
      return;
    }
    this.seq.largest = Math.max(seq, this.seq.largest);
    // console.log("process", { seq, next: this.seq.next });
    if (seq == this.seq.next) {
      this.emitMessage(mesg, seq);
    } else if (seq > this.seq.next) {
      // in the future -- save until we get this.seq.next:
      this.incoming[seq] = mesg;
      // console.log("doing fetchMissing because: ", { seq, next: this.seq.next });
      this.fetchMissing();
    }
  };

  emitMessage = (mesg, seq) => {
    if (seq != this.seq.next) {
      throw Error("message sequence is wrong");
    }
    this.seq.next = seq + 1;
    this.seq.emitted = seq;
    delete mesg.headers?.[SOCKET_HEADER_SEQ];
    //     console.log("emitMessage", mesg.data, {
    //       seq,
    //       next: this.seq.next,
    //       emitted: this.seq.emitted,
    //     });
    this.emit("message", mesg);
    this.reportReceived();
  };

  fetchMissing = reuseInFlight(async () => {
    const missing: number[] = [];
    for (let seq = this.seq.next; seq <= this.seq.largest; seq++) {
      if (this.incoming[seq] === undefined) {
        missing.push(seq);
      }
    }
    if (missing.length == 0) {
      return;
    }
    missing.sort();
    let resp;
    try {
      resp = await this.request({ socket: { missing } });
    } catch (err) {
      // 503 happens when the other side is temporarily not available
      if (err.code != 503) {
        console.log("WARNING: error requesting missing messages", missing, err);
      }
      return;
    }
    if (this.seq == null) {
      return;
    }
    if (resp.headers?.error) {
      // missing data doesn't exist
      this.disconnect();
      return;
    }
    // console.log("got missing", resp.data);
    for (const x of resp.data) {
      this.process(messageData(null, x));
    }
    this.emitIncoming();
  });

  emitIncoming = () => {
    // also emit any incoming that comes next
    let seq = this.seq.next;
    while (this.incoming[seq] != null && this.seq != null) {
      const mesg = this.incoming[seq];
      delete this.incoming[seq];
      this.emitMessage(mesg, seq);
      seq += 1;
    }
    this.reportReceived();
  };

  reportReceived = async () => {
    if (this.seq.reported >= this.seq.emitted) {
      // nothing to report
      return;
    }
    const x = { socket: { emitted: this.seq.emitted } };
    try {
      await this.request(x);
      if (this.seq == null) {
        return;
      }
      this.seq.reported = x.socket.emitted;
    } catch (err) {
      // 503 would mean that the other side is temporarily not connected; that's expected
      if (err.code != 503) {
        console.log(
          "WARNING -- unexpected error - failed to report received",
          err,
        );
      }
    }
  };
}

class SenderTCP {
  private outgoing: { [id: number]: Message } = {};
  private seq = 0;

  constructor(private send: (mesg: Message) => void) {}

  close = () => {
    // @ts-ignore
    delete this.outgoing;
    // @ts-ignore
    delete this.seq;
  };

  process = (mesg) => {
    this.seq += 1;
    // console.log("SenderTCP.process", mesg.data, this.seq);
    this.outgoing[this.seq] = mesg;
    mesg.headers = { ...mesg.headers, [SOCKET_HEADER_SEQ]: this.seq };
    this.send(mesg);
  };

  handleRequest = (mesg) => {
    if (mesg.data?.socket == null || this.seq == null) {
      return;
    }
    const { emitted, missing } = mesg.data.socket;
    if (emitted != null) {
      for (const id in this.outgoing) {
        if (parseInt(id) <= emitted) {
          delete this.outgoing[id];
        }
      }
      mesg.respond({ emitted });
    } else if (missing != null) {
      const v: Message[] = [];
      for (const id of missing) {
        const x = this.outgoing[id];
        if (x == null) {
          // the data does not exist on this client.  This should only happen, e.g.,
          // on automatic failover with the sticky load balancer... ?
          mesg.respond(null, { headers: { error: "nodata" } });
          return;
        }
        v.push(x);
      }
      //console.log("sending missing", v);
      mesg.respond(v);
    }
  };
}
