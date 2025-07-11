/*
Use Conat simple pub/sub to share state for something very *ephemeral* in a project.

This is used, e.g., for broadcasting a user's cursors when they are editing a file.
*/

import { projectSubject } from "@cocalc/conat/names";
import { State } from "@cocalc/conat/types";
import { EventEmitter } from "events";
import { type Subscription, getClient, Client } from "@cocalc/conat/core/client";

export class PubSub extends EventEmitter {
  private subject: string;
  private client: Client;
  private sub?: Subscription;
  private state: State = "disconnected";

  constructor({
    project_id,
    path,
    name,
    client,
  }: {
    project_id: string;
    name: string;
    path?: string;
    client?: Client;
  }) {
    super();
    this.client = client ?? getClient();
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
    this.client.publishSync(this.subject, obj);
  };

  private subscribe = async () => {
    this.sub = await this.client.subscribe(this.subject);
    this.setState("connected");
    for await (const mesg of this.sub) {
      this.emit("change", mesg.data);
    }
  };
}
