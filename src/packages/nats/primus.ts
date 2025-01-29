/*
Implement a websocket as exposed in Primus over NATS.


Development:

1. Change to a directly like packages/project that imports nats and backend

2. Example session:

~/cocalc/src/packages/project$ node
...

Primus = require('@cocalc/nats/primus').Primus;
env = await require('@cocalc/backend/nats').getEnv();
server = new Primus({subject:'test',env,role:'server',id:'s'});
sparks = []; server.on("connection", (spark) => sparks.push(spark))
client = new Primus({subject:'test',env,role:'client',id:'c0'});

sparks[0]
client.on('data',(data)=>console.log('client got', data));0
sparks[0].write("foo")

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
import { type NatsEnv } from "@cocalc/nats/sync/synctable-kv";

export type Role = "client" | "server";

// function otherRole(role: Role): Role {
//   return role == "client" ? "server" : "client";
// }

function getSubjects({ subject, id, channel, sha1 }) {
  // NOTE: when channel is set its sha1 is added as a last
  // segment after all of these.
  const subjects = {
    // control = request/response control channel; clients tell
    //           server they are connecting via this
    control: `${subject}.control`,
    // server =  a server spark listens on server and client
    //           publishes to server
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
    // use sha1 so channel can be any string.
    const segment = sha1(channel);
    for (const k in subjects) {
      subjects[k] += `.${segment}`;
    }
  }
  return subjects;
}

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

  constructor({
    subject,
    channelName = "",
    env,
    role,
    id,
  }: {
    subject: string;
    channelName?: string;
    env: NatsEnv;
    role: Role;
    id: string;
  }) {
    super();

    this.subject = subject;
    this.channelName = channelName;
    this.env = env;
    this.role = role;
    this.id = id;
    this.subjects = getSubjects({
      subject,
      id,
      channel: channelName,
      sha1: env.sha1,
    });
    if (role == "server") {
      this.serve();
    } else {
      this.connect();
    }
    if (this.channelName) {
      this.subscribeChannel();
    }
  }

  destroy = () => {
    // todo
  };

  private serve = async () => {
    if (this.role != "server") {
      throw Error("only server can serve");
    }
    const sub = this.env.nc.subscribe(this.subjects.control);
    for await (const mesg of sub) {
      const data = this.env.jc.decode(mesg.data) ?? ({} as any);
      if (data.cmd == "connect") {
        const spark = new Spark({
          primus: this,
          id: data.id,
        });
        this.sparks[data.id] = spark;
        this.emit("connection", spark);
        mesg.respond(this.env.jc.encode({ status: "ok" }));
      }
    }
  };

  private connect = async () => {
    if (this.role != "client") {
      throw Error("only client can connect");
    }
    const mesg = this.env.jc.encode({
      cmd: "connect",
      id: this.id,
    });
    console.log("connecting...");
    await this.env.nc.publish(this.subjects.control, mesg);
    console.log("connected:");
    const sub = this.env.nc.subscribe(this.subjects.client);
    for await (const mesg of sub) {
      const data = this.env.jc.decode(mesg.data) ?? ({} as any);
      this.emit("data", data);
    }
  };

  private subscribeChannel = async () => {
    const subject =
      this.role == "client"
        ? this.subjects.clientChannel
        : this.subjects.serverChannel;
    const sub = this.env.nc.subscribe(subject);
    for await (const mesg of sub) {
      const data = this.env.jc.decode(mesg.data) ?? ({} as any);
      this.emit("data", data);
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
      subject = this.subjects.clientChannel;
    } else {
      subject = this.subjects.serverChannel;
    }
    this.env.nc.publish(subject, this.env.jc.encode({ data }));
  };

  channel = (channelName: string) => {
    return new Primus({
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

  constructor({ primus, id }) {
    super();
    this.primus = primus;
    const { subject, channelName } = primus;
    this.id = id;
    this.subjects = getSubjects({
      subject,
      id,
      channel: channelName,
      sha1: primus.env.sha1,
    });
    this.init();
  }

  private init = async () => {
    const sub = this.primus.env.nc.subscribe(this.subjects.server);
    for await (const mesg of sub) {
      const { data } = this.primus.env.jc.decode(mesg.data) ?? ({} as any);
      this.emit("data", data);
    }
  };

  write = (data) => {
    this.primus.env.nc.publish(
      this.subjects.client,
      this.primus.env.jc.encode({ data }),
    );
  };

  destroy = () => {
    // todo -- maybe call a method on sub created in subscribe?
  };
}
