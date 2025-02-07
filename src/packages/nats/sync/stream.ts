/*
Always Consistent Centralized Stream

TODO:
 - ability to easily initialize with only the
   last n messages or only messages going back
   to time t


DEVELOPMENT:

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = new a.Stream({name:'test',env,subjects:'foo.>'}); await s.init();


With browser client using a project:

# in browser
> s = await cc.client.nats_client.stream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094', filter:'foo'})

# in node:
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = new a.Stream({name:'project-56eb622f-d398-489a-83ef-c09f1a1e8094',env,filter:'foo',subjects:'project-56eb622f-d398-489a-83ef-c09f1a1e8094.>'}); await s.init();

*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { jetstreamManager, jetstream } from "@nats-io/jetstream";
import { matchesPattern } from "@cocalc/nats/util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export class Stream extends EventEmitter {
  public readonly name: string;
  private options?;
  private subjects: string | string[];
  private filter?: string;
  private env: NatsEnv;
  private js;
  private stream?;
  private consumer?;
  private watch?;
  private raw: any[] = [];
  public readonly events: any[] = [];

  constructor({
    name,
    env,
    subjects,
    filter,
    options,
  }: {
    name: string;
    subjects: string | string[];
    filter?: string;
    env: NatsEnv;
    options?;
  }) {
    super();
    this.env = env;
    // create a jetstream client so we can publish to the stream
    this.js = jetstream(env.nc);
    this.name = name;
    this.options = options;
    this.subjects = typeof subjects == "string" ? [subjects] : subjects;
    if (this.subjects.length == 0) {
      throw Error("subjects must be at least one string");
    }
    this.filter = filter;
  }

  init = reuseInFlight(async () => {
    if (this.stream != null) {
      return;
    }
    const jsm = await jetstreamManager(this.env.nc);
    const options = {
      subjects: this.subjects,
      compression: "s2",
      ...this.options,
    };
    try {
      this.stream = await jsm.streams.add({
        name: this.name,
        ...options,
      });
    } catch (err) {
      // probably already exists, so try to modify to have the requested properties.
      this.stream = await jsm.streams.update(this.name, options);
    }
    this.consumer = await this.getConsumer();
    this.startFetch();
  });

  publish = async (event, subject?) => {
    if (subject != null) {
      for (const pattern of this.subjects) {
        if (!matchesPattern({ pattern, subject })) {
          throw Error(
            `subject must match subjects=${JSON.stringify(this.subjects)}`,
          );
        }
      }
    }
    subject = subject ?? this.subjects[0];
    if (this.filter) {
      if (!matchesPattern({ pattern: this.filter, subject })) {
        throw Error(`subject must match filter="${this.filter}"`);
      }
    }
    return await this.js.publish(subject, this.env.jc.encode(event));
  };

  private getConsumer = async () => {
    const js = jetstream(this.env.nc);
    const jsm = await jetstreamManager(this.env.nc);
    // making an ephemeral consumer
    const { name } = await jsm.consumers.add(this.name, {
      filter_subject: this.filter,
    });
    return await js.consumers.get(this.name, name);
  };

  private startFetch = async () => {
    if (this.consumer == null) {
      throw Error("consumer not defined");
    }
    const consumer = this.consumer;
    this.watch = await consumer.fetch();
    for await (const mesg of this.watch) {
      this.handle(mesg);
    }
  };

  private handle = (mesg) => {
    let data;
    try {
      data = this.env.jc.decode(mesg.data);
    } catch {
      data = mesg.data;
    }
    this.events.push(data);
    this.raw.push(mesg);
  };

  close = () => {
    if (this.watch == null) {
      return;
    }
    this.watch.stop();
    delete this.watch;
    delete this.stream;
    delete this.consumer;
    this.emit("closed");
    this.removeAllListeners();
  };
}
