/*
Use NATS simple pub/sub to share state for something *ephemeral* in a project.

This is used, e.g., for broadcasting a user's cursors when they are editing a file.
*/

import { projectSubject } from "@cocalc/conat/names";
import { type NatsEnv, State } from "@cocalc/conat/types";
import { EventEmitter } from "events";
import { isConnectedSync } from "@cocalc/conat/util";
import { type Subscription } from "@cocalc/conat/core/client";

export class PubSub extends EventEmitter {
  private subject: string;
  private env: NatsEnv;
  private sub?: Subscription;
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
    // @ts-ignore
    this.sub?.close();
    delete this.sub;
  };

  set = (obj) => {
    if (!isConnectedSync()) {
      // when disconnected, all state is dropped
      return;
    }
    this.env.cn.publish(this.subject, obj);
  };

  private subscribe = async () => {
    this.sub = await this.env.cn.subscribe(this.subject);
    this.setState("connected");
    for await (const mesg of this.sub) {
      this.emit("change", mesg.data);
    }
  };
}
