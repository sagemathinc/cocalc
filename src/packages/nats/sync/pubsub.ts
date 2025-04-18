/*
Use NATS simple pub/sub to share state for something *ephemeral* in a project.
*/

import { projectSubject } from "@cocalc/nats/names";
import { type NatsEnv, State } from "@cocalc/nats/types";
import { EventEmitter } from "events";

export class PubSub extends EventEmitter {
  private subject: string;
  private env: NatsEnv;
  private sub?;
  private state: State = "disconnected";

  constructor({
    project_id,
    path,
    name,
    env,
  }: {
    project_id: string;
    name: string;
    path?: string;
    env: NatsEnv;
  }) {
    super();
    this.env = env;
    this.subject = projectSubject({
      project_id,
      path,
      service: `pubsub-${name}`,
    });
    this.subscribe();
  }

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    this.setState("closed");
    this.removeAllListeners();
    this.sub?.close();
    delete this.sub;
  };

  set = (obj) => {
    this.env.nc.publish(this.subject, this.env.jc.encode(obj));
  };

  private subscribe = async () => {
    this.sub = this.env.nc.subscribe(this.subject);
    this.setState("connected");
    for await (const mesg of this.sub) {
      this.emit("change", this.env.jc.decode(mesg.data));
    }
  };
}
