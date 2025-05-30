/*
Implement something that acts like a project-specific websocket from 
**SubjectSocket**, but using Conats (which is really socket-io through a central
message broker).

For unit tests, see

    packages/backend/conat/test/subjectSocket.test.ts

Development:

1. Change to a directory such as packages/project

2. Example session:

~/cocalc/src/packages/project$ node
...

# communication

SubjectSocket = require('@cocalc/conat/subjectSocket').SubjectSocket;
env = await require('@cocalc/backend/conat').getEnv();
server = new SubjectSocket({subject:'test',env,role:'server',id:'s'});
sparks = []; server.on("connection", (spark) => sparks.push(spark));

client = new SubjectSocket({subject:'test',env,role:'client',id:'c0'});

client.on('data',(data)=>console.log('client got', data));0
sparks[0].write("foo")

sparks[0].on('data', (data)=>console.log("server got", data));0
client.write('bar')

*/

import { EventEmitter } from "events";
import { type Client, type Subscription } from "@cocalc/conat/core/client";
import { delay } from "awaiting";

export type Role = "client" | "server";

// clients send a heartbeat to the server this frequently.
const HEARBEAT_INTERVAL = 60000;

// We queue up unsent writes, but only up to a point (to not have a huge memory issue).
// Any write beyond the last this many are discarded:
const DEAFULT_MAX_QUEUE_SIZE = 100;

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

function getSubjects({ subject, id }) {
  const subjects = {
    // control = request/response control; clients tell
    //           server they are connecting via this (pings, registering)
    control: `${subject}.control`,
    // server =  a server spark listens on server and client
    //           publishes to server with their id
    server: `${subject}.server.${id}`,
    // client =  client connection listens on this and
    //           server spark writes to it
    client: `${subject}.client.${id}`,
  };
  return subjects;
}

type State = "connecting" | "ready" | "closed";

export class SubjectSocket extends EventEmitter {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  subscribe: string;
  sparks: { [id: string]: Socket } = {};
  subjects: {
    control: string;
    server: string;
    client: string;
  };
  // this is just for compat with subjectSocket api:
  address = { ip: "" };
  conn: { id: string };
  subs: Subscription[] = [];
  OPEN = 1;
  CLOSE = 0;
  readyState: 0;
  state: State = "connecting";
  queuedWrites: any[] = [];
  maxQueueSize: number;

  constructor({
    subject,
    client,
    role,
    id,
    maxQueueSize = DEAFULT_MAX_QUEUE_SIZE,
  }: SubjectSocketOptions) {
    super();

    //     console.log("PRIMUS Creating", {
    //       subject,
    //       id,
    //     });

    this.maxQueueSize = maxQueueSize;
    this.subject = subject;
    this.client = client;
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.subjects = getSubjects({
      subject,
      id,
    });
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
    for (const id in this.sparks) {
      f(this.sparks[id], id);
    }
  };

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const data of this.queuedWrites) {
        this.write(data);
        this.queuedWrites = [];
      }
    }
    this.emit(state);
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    if (this.role == "client") {
      // tell server we're gone -- faster than it waiting
      // for heartbeat timeout
      this.client.publishSync(this.subjects.control, {
        cmd: "close",
        id: this.id,
      });
    }
    this.queuedWrites = [];
    this.setState("closed");
    this.removeAllListeners();

    delete connections[getKey(this)];
    for (const sub of this.subs) {
      sub.close();
    }
    this.subs = [];
    for (const id in this.sparks) {
      this.sparks[id].destroy();
    }
    this.sparks = {};
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
    const sub = await this.client.subscribe(this.subjects.control);
    this.subs.push(sub);
    this.setState("ready");
    for await (const mesg of sub) {
      //console.log("got ", { data: mesg.data });
      const data = mesg.data;
      if (data?.cmd == "ping") {
        const spark = this.sparks[data.id];
        if (spark != null) {
          spark.lastPing = Date.now();
          mesg.respond("pong");
        } else {
          mesg.respond("dead");
        }
      } else if (data?.cmd == "connect") {
        const spark = new Socket({
          subjectSocket: this,
          id: data.id,
        });
        this.sparks[data.id] = spark;
        this.emit("connection", spark);
        mesg.respond({ status: "ok" });
      } else if (data?.cmd == "close") {
        this.sparks[data.id].close();
        delete this.sparks[data.id];
        // don't bother to respond
      } else {
        mesg.respond({ error: `unknown command - ${data?.cmd}` });
      }
    }
  };

  private deleteSockets = async () => {
    while (this.state != "closed") {
      for (const id in this.sparks) {
        const spark = this.sparks[id];
        if (Date.now() - spark.lastPing > HEARBEAT_INTERVAL * 2.5) {
          spark.destroy();
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
    for (const sub of this.subs) {
      sub.close();
    }
    this.subs = [];
    for (const id in this.sparks) {
      this.sparks[id].destroy();
    }
    this.sparks = {};
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

    //     const log = (status) => {
    //       console.log(`conat:subjectSocket: ${status}`, {
    //         subject: this.subject,
    //       });
    //     };
    const sub = await this.client.subscribe(this.subjects.client);
    // log("send connect request");
    const mesg = { cmd: "connect", id: this.id };
    let d = 3000;
    while (this.state != "closed") {
      try {
        const resp = await this.client.request(this.subjects.control, mesg, {
          timeout: 5000,
        });
        const { status } = resp.data;
        if (status != "ok") {
          throw Error(`bad status -- ${status}`);
        }
        break;
      } catch (err) {
        //log(`connection request failed - ${err}`);
        await delay(d);
        d = Math.min(15000, d * 1.3);
      }
    }
    if (this.state == "closed") {
      return;
    }
    this.clientPing();
    //log("subscribed");
    this.subs.push(sub);
    this.setState("ready");
    for await (const mesg of sub) {
      // log("got data");
      this.emit("data", mesg.data);
    }
  };

  // we send pings to the server and it responds with a pong.
  // if response fails, reconnect.
  private clientPing = async () => {
    while (this.state != "closed") {
      try {
        const resp = await this.client.request(this.subjects.control, {
          cmd: "ping",
          id: this.id,
        });
        const x = resp.data;
        if (x != "pong") {
          this.reconnect();
          return;
        }
      } catch {
        // if sending ping fails, reconnect
        this.reconnect();
        return;
      }
      await delay(HEARBEAT_INTERVAL);
    }
  };

  // client: writes to server
  // server: broadcast to ALL connected clients
  write = (data) => {
    // console.log(this.role, " write ", { data });
    if (this.state == "connecting") {
      this.queuedWrites.push(data);
      while (this.queuedWrites.length > this.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    if (this.state == "closed") {
      return;
    }
    // console.log("conat:subjectSocket -- write", data);
    let subject;
    if (this.role == "server") {
      // write to all the sparks that are connected.
      for (const id in this.sparks) {
        this.sparks[id].write(data);
      }
      return;
    } else {
      // we are the client, so write to server
      subject = this.subjects.server;
    }
    this.client.publishSync(subject, data);
    return true;
  };
}

// only used on the server
export class Socket extends EventEmitter {
  subjectSocket: SubjectSocket;
  id: string;
  subjects;
  lastPing = Date.now();
  // this is just for compat with subjectSocket api:
  address = { ip: "" };
  conn: { id: string };
  subs: Subscription[] = [];
  state: State = "connecting";
  queuedWrites: any[] = [];

  constructor({ subjectSocket, id }) {
    super();
    this.subjectSocket = subjectSocket;
    const { subject } = subjectSocket;
    this.id = id;
    this.conn = { id };
    this.subjects = getSubjects({
      subject,
      id,
    });
    this.init();
  }

  private setState = (state: State) => {
    this.state = state;
    if (state == "ready") {
      for (const data of this.queuedWrites) {
        this.write(data);
        this.queuedWrites = [];
      }
    }
    this.emit(state);
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    this.queuedWrites = [];
    this.setState("closed");
    this.removeAllListeners();
    for (const sub of this.subs) {
      sub.close();
    }
    this.subs = [];
    delete this.subjectSocket.sparks[this.id];
  };
  destroy = () => this.close();
  end = () => this.close();

  private init = async () => {
    const sub = await this.subjectSocket.client.subscribe(this.subjects.server);
    this.setState("ready");
    this.subs.push(sub);
    for await (const mesg of sub) {
      this.emit("data", mesg.data);
    }
  };

  write = (data) => {
    if (this.state == "connecting") {
      this.queuedWrites.push(data);
      while (this.queuedWrites.length > this.subjectSocket.maxQueueSize) {
        this.queuedWrites.shift();
      }
      return;
    }
    if (this.state == "closed") {
      return;
    }
    this.subjectSocket.client.publishSync(this.subjects.client, data);
    return true;
  };
}
