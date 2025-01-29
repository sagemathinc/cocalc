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


> server.write('foo')
> client2 = new a.Primus({subject:'test',env,role:'client',id:'xx'}); client2.on('data',(data)=>console.log('client2 got', data)); 0
> server.write('bar')

> server.on("connection", (spark) => spark.write("hello"))
> client3 = new a.Primus({subject:'test', env, role:'client'}); client3.on('data',(data)=>console.log('client3 got', data)); 0


*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/sync/synctable-kv";

export type Role = "client" | "server";

// function otherRole(role: Role): Role {
//   return role == "client" ? "server" : "client";
// }

export class Primus extends EventEmitter {
  subject: string;
  env: NatsEnv;
  role: Role;
  id: string;
  subscribe: string;
  subjects: { control: string; server: string; client: string };

  constructor({
    subject,
    env,
    role,
    id,
  }: {
    subject: string;
    env: NatsEnv;
    role: Role;
    id: string;
  }) {
    super();
    this.subject = subject;
    this.env = env;
    this.role = role;
    this.id = id;
    this.subjects = {
      control: `${subject}.control`,
      // only used by client: must agree with spark below
      server: `${subject}.server.${id}`,
      client: `${subject}.client.${id}`,
    };
    if (role == "server") {
      this.serve();
    } else {
      this.connect();
    }
  }

  //   channel = (name: string) => {
  //     return new PrimusChannel({ primus: this, name });
  //   };

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
        const spark = new Spark({ primus: this, id: data.id });
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

  write = (data) => {
    if (this.role != "client") {
      throw Error("only client can write");
    }
    this.env.nc.publish(this.subjects.server, this.env.jc.encode({ data }));
  };
}

// only used on the server
export class Spark extends EventEmitter {
  primus: Primus;
  id: string;
  subjects: { server: string; client: string };

  constructor({ primus, id }) {
    super();
    this.primus = primus;
    this.id = id;
    const subject = primus.subject;
    this.subjects = {
      server: `${subject}.server.${id}`,
      client: `${subject}.client.${id}`,
    };
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

// export class PrimusChannel extends EventEmitter {
//   primus: Primus;
//   name: string;
//   subjects: { subscribe: string; publish: string };

//   constructor({ primus, name }) {
//     super();
//     this.primus = primus;
//     this.name = name;
//     const segment = primus.env.sha1(name);
//     const base = `${this.primus.subject}.${segment}`;
//     this.subjects = {
//       subscribe: `${base}.${role}`,
//       publish: `${base}.${otherRole(role)}`,
//     };
//     this.init();
//   }

//   private init = async () => {
//     const sub = this.primus.env.nc.subscribe(this.subjects.subscribe);
//     for await (const mesg of sub) {
//       const { data } = this.primus.env.jc.decode(mesg.data) ?? ({} as any);
//       this.emit("data", data);
//     }
//   };

//   write = (data) => {
//     this.primus.env.nc.publish(
//       this.subjects.publish,
//       this.primus.env.jc.encode({ data }),
//     );
//   };

//   destroy = () => {
//     // todo
//   };
// }
