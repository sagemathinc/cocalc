/*
A supercluster is a cluster of 2 or more Conat servers.  Each conat server may itself 
internally be a cluster using the socketio cluster module, or redis streams or pub/sub.
*/

import type { Client } from "./client";
import { Patterns } from "./patterns";
import {
  randomChoice,
  updateInterest,
  type InterestUpdate,
} from "@cocalc/conat/core/server";
import type { DStream } from "@cocalc/conat/sync/dstream";
import { once } from "@cocalc/util/async-utils";
import { server as createPersistServer } from "@cocalc/conat/persist/server";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:core:supercluster");

export async function superclusterLink({
  client,
  clusterName,
}: {
  client: Client;
  clusterName: string;
}) {
  const link = new SuperclusterLink(client, clusterName);
  await link.init();
  return link;
}

export class SuperclusterLink {
  private interest: Patterns<{ [queue: string]: Set<string> }> = new Patterns();
  private sticky: { [pattern: string]: { [subject: string]: string } } = {};
  private stream: DStream<InterestUpdate>;
  private state: "init" | "ready" | "closed" = "init";

  constructor(
    private client: Client,
    private clusterName: string,
  ) {
    if (!client) {
      throw Error("client must be specified");
    }
    if (!clusterName) {
      throw Error("clusterName must be specified");
    }
  }

  init = async () => {
    this.stream = await superclusterStream({
      client: this.client,
      clusterName: this.clusterName,
    });
    for (const update of this.stream.getAll()) {
      updateInterest(update, this.interest, this.sticky);
    }
    this.stream.on("change", this.handleUpdate);
    this.state = "ready";
  };

  handleUpdate = (update) => {
    updateInterest(update, this.interest, this.sticky);
  };

  close = () => {
    this.state = "closed";
    this.stream?.removeListener("change", this.handleUpdate);
    this.stream?.close();
  };

  publish = ({ subject, data }) => {
    let count = 0;
    for (const pattern of this.interest.matches(subject)) {
      const g = this.interest.get(pattern)!;
      // send to exactly one in each queue group
      for (const queue in g) {
        const target = this.loadBalance({
          pattern,
          subject,
          queue,
          targets: g[queue],
        });
        if (target !== undefined) {
          // worry about from field?
          this.client.conn.emit("publish", [subject, ...data, true]);
          count += 1;
        }
      }
    }
    return count;
  };

  private loadBalance = ({
    //     pattern,
    //     subject,
    //     queue,
    targets,
  }: {
    pattern: string;
    subject: string;
    queue: string;
    targets: Set<string>;
  }): string | undefined => {
    if (targets.size == 0) {
      return undefined;
    }
    // TODO: deal with sticky queue groups!
    return randomChoice(targets);
  };

  waitForInterest = async (
    subject: string,
    timeout: number,
    signal?: AbortSignal,
  ) => {
    const matches = this.interest.matches(subject);

    if (matches.length > 0 || !timeout) {
      // NOTE: we never return the actual matches, since this is a
      // potential security vulnerability.
      // it could make it very easy to figure out private inboxes, etc.
      return matches.length > 0;
    }
    const start = Date.now();
    while (this.state != "closed" && !signal?.aborted) {
      if (Date.now() - start >= timeout) {
        throw Error("timeout");
      }
      await once(this.interest, "change");
      if ((this.state as any) == "closed" || signal?.aborted) {
        return false;
      }
      // todo: implement this.interest.hasMatch that just checks if there is at least one match
      const matches = this.interest.matches(subject);
      if (matches.length > 0) {
        return true;
      }
    }

    return false;
  };
}

export function superclusterStreamNames(clusterName: string) {
  return {
    interest: `cluster/${clusterName}/interest`,
    sticky: `cluster/${clusterName}/sticky`,
  };
}

export function superclusterService(clusterName: string) {
  return `persist-${clusterName}`;
}

export async function createSuperclusterPersistServer({
  client,
  clusterName,
}: {
  client: Client;
  clusterName: string;
}) {
  const service = superclusterService(clusterName);
  logger.debug("createSuperclusterPersistServer: ", { service });
  return await createPersistServer({ client, service });
}

export async function superclusterStream({
  client,
  clusterName,
}: {
  client: Client;
  clusterName: string;
}): Promise<DStream<InterestUpdate>> {
  logger.debug("superclusterStream: ", { clusterName });
  if (!clusterName) {
    throw Error("clusterName must be set");
  }
  const stream = await client.sync.dstream<InterestUpdate>({
    name: superclusterStreamNames(clusterName).interest,
    service: superclusterService(clusterName),
    noCache: true,
  });
  logger.debug("superclusterStream: GOT IT", { clusterName });
  return stream;
}
