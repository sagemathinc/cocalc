/*
A supercluster is a cluster of 2 or more Conat servers.  Each conat server may itself 
internally be a cluster using the socketio cluster module, or redis streams or pub/sub.
*/

import type { Client } from "./client";
import { Patterns } from "./patterns";
import {
  SUPERCLUSTER_INTEREST_STREAM_NAME,
  updateInterest,
} from "@cocalc/conat/core/server";
import type { DStream } from "@cocalc/conat/sync/dstream";

export async function superclusterLink(client: Client) {
  const link = new SuperclusterLink(client);
  await link.init();
  return link;
}

export class SuperclusterLink {
  private interest: Patterns<{ [queue: string]: Set<string> }> = new Patterns();
  private sticky: { [pattern: string]: { [subject: string]: string } } = {};
  private stream: DStream<InterestUpdate>;

  constructor(private client: Client) {}

  init = async () => {
    this.stream = await this.client.sync.dstream({
      name: SUPERCLUSTER_INTEREST_STREAM_NAME,
      noCache: true,
    });
    for (const update of this.stream.getAll()) {
      updateInterest(update, this.interest, this.sticky);
    }
    this.stream.on("change", this.handleUpdate);
  };

  handleUpdate = (update) => {
    updateInterest(update, this.interest, this.sticky);
  };

  close = () => {
    this.stream?.removeListener("change", this.handleUpdate);
    this.stream?.close();
    delete this.stream;
  };
}
