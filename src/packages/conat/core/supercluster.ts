/*
A supercluster is a cluster of 2 or more Conat servers.  Each conat server may itself 
internally be a cluster using the socketio cluster module, or redis streams or pub/sub.
*/

import type { Client } from "./client";
import { Patterns } from "./patterns";
import {
  randomChoice,
  updateInterest,
  updateSticky,
  type InterestUpdate,
  type StickyUpdate,
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
  private streams: ClusterStreams;
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
    this.streams = await superclusterStreams({
      client: this.client,
      clusterName: this.clusterName,
    });
    for (const update of this.streams.interest.getAll()) {
      updateInterest(update, this.interest, this.sticky);
    }
    this.streams.interest.on("change", this.handleInterestUpdate);
    this.streams.sticky.on("change", this.handleStickyUpdate);
    this.state = "ready";
  };

  handleInterestUpdate = (update) => {
    updateInterest(update, this.interest, this.sticky);
  };

  handleStickyUpdate = (update) => {
    updateSticky(update, this.sticky);
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    if (this.streams != null) {
      this.streams.interest.removeListener("change", this.handleInterestUpdate);
      this.streams.interest.close();
      this.streams.sticky.close();
      // @ts-ignore
      delete this.streams;
    }
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
    const hasMatch = this.interest.hasMatch(subject);

    if (hasMatch || !timeout) {
      // NOTE: we never return the actual matches, since this is a
      // potential security vulnerability.
      // it could make it very easy to figure out private inboxes, etc.
      return hasMatch;
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
      const hasMatch = this.interest.hasMatch(subject);
      if (hasMatch) {
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

export interface ClusterStreams {
  interest: DStream<InterestUpdate>;
  sticky: DStream<StickyUpdate>;
}

export async function superclusterStreams({
  client,
  clusterName,
}: {
  client: Client;
  clusterName: string;
}): Promise<ClusterStreams> {
  logger.debug("superclusterStream: ", { clusterName });
  if (!clusterName) {
    throw Error("clusterName must be set");
  }
  const names = superclusterStreamNames(clusterName);
  const opts = {
    service: superclusterService(clusterName),
    noCache: true,
    ephemeral: true,
  };
  const interest = await client.sync.dstream<InterestUpdate>({
    name: names.interest,
    ...opts,
  });
  const sticky = await client.sync.dstream<StickyUpdate>({
    name: names.sticky,
    ...opts,
  });
  logger.debug("superclusterStreams: got them", { clusterName });
  return { interest, sticky };
}

// Periodically delete not-necessary updates from the interest stream
export async function trimSuperclusterStreams(
  streams: ClusterStreams,
  data: {
    interest: Patterns<{ [queue: string]: Set<string> }>;
    sticky: { [pattern: string]: { [subject: string]: string } };
  },
  // don't delete anything that isn't at lest minAge ms old.
  minAge: number,
): Promise<number[]> {
  const { interest } = streams;
  // we iterate over the interest stream checking for subjects
  // with no current interest at all; in such cases it is safe
  // to purge them entirely from the stream.
  const seqs: number[] = [];
  const now = Date.now();
  for (let n = 0; n < interest.length; n++) {
    const time = interest.time(n);
    if (time == null || now - time.valueOf() <= minAge) {
      break;
    }
    const update = interest.get(n) as InterestUpdate;
    if (!data.interest.hasPattern(update.subject)) {
      const seq = interest.seq(n);
      if (seq != null) {
        seqs.push(seq);
      }
    }
  }
  if (seqs.length > 0) {
    // [ ] todo -- add to interest.delete a version where it takes an array of sequence numbers
    logger.debug("trimSuperclusterStream: trimming", { seqs });
    for (const seq of seqs) {
      await interest.delete({ seq });
    }
  }
  return seqs;
}
