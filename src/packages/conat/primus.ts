/*
Implement something that acts like a project-specific websocket from 
**Primus**, but using Conats (which is really socket-io through a central
message broker).

Development:

1. Change to a directory such as packages/project

2. Example session:

~/cocalc/src/packages/project$ node
...

# non-channel full communication

Primus = require('@cocalc/conat/primus').Primus;
env = await require('@cocalc/backend/nats').getEnv();
server = new Primus({subject:'test',env,role:'server',id:'s'});
sparks = []; server.on("connection", (spark) => sparks.push(spark));

client = new Primus({subject:'test',env,role:'client',id:'c0'});

client.on('data',(data)=>console.log('client got', data));0
sparks[0].write("foo")

sparks[0].on('data', (data)=>console.log("server got", data));0
client.write('bar')

# communication via a channel.

s9 = server.channel('9')
c9 = client.channel('9')
c9.on("data", (data)=>console.log('c9 got', data));0
s9.on("data", (data)=>console.log('s9 got', data));0

c9.write("from client 9")
s9.write("from the server 9")



client_b = new Primus({subject:'test',env,role:'client',id:'cb'});
c9b = client_b.channel('9')
c9b.on("data", (data)=>console.log('c9b got', data));0

s9.sparks['cb'].write('blah')

*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/conat/types";
import { delay } from "awaiting";
import { encodeBase64 } from "@cocalc/conat/util";
import { type Subscription } from "@cocalc/conat/core/client";

export type Role = "client" | "server";

const PING_INTERVAL = 30000;

interface PrimusOptions {
  subject: string;
  channelName?: string;
  env: NatsEnv;
  role: Role;
  id: string;
}

const connections: { [key: string]: Primus } = {};
export function getPrimusConnection(opts: PrimusOptions): Primus {
  const key = getKey(opts);
  if (connections[key] == null) {
    connections[key] = new Primus(opts);
  }
  return connections[key];
}

function getKey({ subject, channelName, role, id }: PrimusOptions) {
  return JSON.stringify({ subject, channelName, role, id });
}

function getSubjects({ subject, id, channel }) {
  const subjects = {
    // control = request/response control channel; clients tell
    //           server they are connecting via this
    control: `${subject}.control`,
    // server =  a server spark listens on server and client
    //           publishes to server with their id
    server: `${subject}.server.${id}`,
    // client =  client connection listens on this and
    //           server spark writes to it
    client: `${subject}.client.${id}`,
    // channel = when set all clients listen on
    //           this; server sends to this.
    clientChannel: `${subject}.channel.client`,
    serverChannel: `${subject}.channel.server`,
  };
  if (channel) {
    // use base64 encoding so channel can be any string.
    const segment = encodeBase64(channel);
    for (const k in subjects) {
      subjects[k] += `.${segment}`;
    }
  }
  return subjects;
}

type State = "ready" | "closed";

export class Primus extends EventEmitter {
  subject: string;
  channelName: string;
  env: NatsEnv;
  role: Role;
  id: string;
  subscribe: string;
  sparks: { [id: string]: Spark } = {};
  subjects: {
    control: string;
    server: string;
    client: string;
    clientChannel: string;
    serverChannel: string;
  };
  // this is just for compat with primus api:
  address = { ip: "" };
  conn: { id: string };
  subs: Subscription[] = [];
  OPEN = 1;
  CLOSE = 0;
  readyState: 0;
  state: State = "ready";

  constructor({ subject, channelName = "", env, role, id }: PrimusOptions) {
    super();

    //     console.log("PRIMUS Creating", {
    //       subject,
    //       id,
    //       channel: channelName,
    //     });

    this.subject = subject;
    this.channelName = channelName;
    this.env = env;
    this.role = role;
    this.id = id;
    this.conn = { id };
    this.subjects = getSubjects({
      subject,
      id,
      channel: channelName,
    });
    if (role == "server") {
      this.serve();
    } else {
      this.client();
    }
    if (this.channelName) {
      this.subscribeChannel();
    }
  }

  forEach = (f: (spark, id) => void) => {
    for (const id in this.sparks) {
      f(this.sparks[id], id);
    }
  };

  destroy = () => {
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    delete connections[getKey(this)];
    for (const sub of this.subs) {
      sub.close();
    }
    this.subs = [];
    for (const id in this.sparks) {
      this.sparks[id].destroy();
    }
    this.sparks = {};
  };

  end = () => this.destroy();

  close = () => this.destroy();

  connect = () => {};

  private serve = async () => {
    if (this.role != "server") {
      throw Error("only server can serve");
    }
    this.deleteSparks();
    const sub = await this.env.cn.subscribe(this.subjects.control);
    this.subs.push(sub);
    for await (const mesg of sub) {
      console.log("got ", { data: mesg.data });
      const data = mesg.data;
      if (data == null) {
        continue;
      }
      if (data.cmd == "ping") {
        const spark = this.sparks[data.id];
        if (spark != null) {
          spark.lastPing = Date.now();
        }
      } else if (data.cmd == "connect") {
        const spark = new Spark({
          primus: this,
          id: data.id,
        });
        this.sparks[data.id] = spark;
        this.emit("connection", spark);
        mesg.respond({ status: "ok" });
      }
    }
  };

  private deleteSparks = async () => {
    while (this.state != "closed") {
      for (const id in this.sparks) {
        const spark = this.sparks[id];
        if (Date.now() - spark.lastPing > PING_INTERVAL * 1.5) {
          spark.destroy();
        }
      }
      await delay(PING_INTERVAL * 1.5);
    }
  };

  private client = async () => {
    if (this.role != "client") {
      throw Error("only client can connect");
    }
    const mesg = { cmd: "connect", id: this.id };
    console.log("Nats Primus: connecting...");
    await this.env.cn.request(this.subjects.control, mesg);
    this.clientPing();
    console.log("Nats Primus: connected:");
    const sub = await this.env.cn.subscribe(this.subjects.client);
    this.subs.push(sub);
    for await (const mesg of sub) {
      this.emit("data", mesg.data);
    }
  };

  private clientPing = async () => {
    while (this.state != "closed") {
      try {
        await this.env.cn.publish(this.subjects.control, {
          cmd: "ping",
          id: this.id,
        });
      } catch {
        // if ping fails, connection is not working, so die.
        this.destroy();
        return;
      }
      await delay(PING_INTERVAL);
    }
  };

  private subscribeChannel = async () => {
    const subject =
      this.role == "client"
        ? this.subjects.clientChannel
        : this.subjects.serverChannel;
    const sub = await this.env.cn.subscribe(subject);
    this.subs.push(sub);
    for await (const mesg of sub) {
      this.emit("data", mesg.data);
    }
  };

  // client: writes to server
  // server: write to ALL connected clients in channel model.
  write = (data) => {
    let subject;
    if (this.role == "server") {
      if (!this.channel) {
        throw Error("broadcast write not implemented when not in channel mode");
      }
      // we are the server, so write to all clients in channel
      subject = this.subjects.clientChannel;
    } else {
      // we are the client, so write to server (possibly a channel)
      subject = this.channelName
        ? this.subjects.serverChannel
        : this.subjects.server;
    }
    this.env.cn.publish(subject, data);
    return true;
  };

  channel = (channelName: string) => {
    return getPrimusConnection({
      subject: this.subject,
      channelName,
      env: this.env,
      role: this.role,
      id: this.id,
    });
  };
}

// only used on the server
export class Spark extends EventEmitter {
  primus: Primus;
  id: string;
  subjects;
  lastPing = Date.now();
  // this is just for compat with primus api:
  address = { ip: "" };
  conn: { id: string };
  subs: any[] = [];
  state: State = "ready";

  constructor({ primus, id }) {
    super();
    this.primus = primus;
    const { subject, channelName } = primus;
    this.id = id;
    this.conn = { id };
    this.subjects = getSubjects({
      subject,
      id,
      channel: channelName,
    });
    this.init();
  }

  destroy = () => {
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    for (const sub of this.subs) {
      sub.close();
    }
    this.subs = [];
    delete this.primus.sparks[this.id];
  };

  end = () => this.destroy();

  private init = async () => {
    const sub = await this.primus.env.cn.subscribe(this.subjects.server);
    this.subs.push(sub);
    for await (const mesg of sub) {
      this.emit("data", mesg.data);
    }
  };

  write = (data) => {
    this.primus.env.cn.publish(this.subjects.client, data);
    return true;
  };
}
