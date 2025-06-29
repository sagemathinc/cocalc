import { type Client, connect } from "./client";
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

const logger = getLogger("conat:core:cluster");

export async function clusterLink(
  address: string,
  systemAccountPassword: string,
) {
  const client = connect({ address, systemAccountPassword });
  if (client.info == null) {
    await client.waitUntilSignedIn();
    if (client.info == null) throw Error("bug");
  }
  const { id, clusterName } = client.info;
  if (!id) {
    throw Error("id must be specified");
  }
  if (!clusterName) {
    throw Error("clusterName must be specified");
  }
  const link = new ClusterLink(client, id, clusterName, address);
  await link.init();
  return link;
}

export { type ClusterLink };

class ClusterLink {
  private interest: Patterns<{ [queue: string]: Set<string> }> = new Patterns();
  private sticky: { [pattern: string]: { [subject: string]: string } } = {};
  private streams: ClusterStreams;
  private state: "init" | "ready" | "closed" = "init";

  constructor(
    public readonly client: Client,
    public readonly id: string,
    public readonly clusterName: string,
    public readonly address: string,
  ) {
    if (!client) {
      throw Error("client must be specified");
    }
    if (!clusterName) {
      throw Error("clusterName must be specified");
    }
    if (!id) {
      throw Error("id must be specified");
    }
  }

  init = async () => {
    this.streams = await clusterStreams({
      client: this.client,
      id: this.id,
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

  publish = ({
    subject,
    data,
    queueGroups,
  }: {
    subject: string;
    data: any;
    // these are already used queueGroups, possibly from other links
    queueGroups: { [pattern: string]: Set<string> };
  }) => {
    let count = 0;
    for (const pattern of this.interest.matches(subject)) {
      const g = this.interest.get(pattern)!;
      // send to exactly one in each queue group.
      for (const queue in g) {
        if (queueGroups[pattern]?.has(queue)) {
          // already published to same queue group elsewhere in the (super-)cluster.
          continue;
        }
        const target = this.loadBalance({
          pattern,
          subject,
          queue,
          targets: g[queue],
        });
        if (target !== undefined) {
          if (queueGroups[pattern] == null) {
            queueGroups[pattern] = new Set();
          }
          queueGroups[pattern].add(queue);

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

  hasInterest = (subject) => {
    return this.interest.hasMatch(subject);
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

function clusterStreamNames({
  clusterName,
  id,
}: {
  clusterName: string;
  id: string;
}) {
  return {
    interest: `cluster/${clusterName}/${id}/interest`,
    sticky: `cluster/${clusterName}/${id}/sticky`,
  };
}

export function clusterService({
  id,
  clusterName,
}: {
  id: string;
  clusterName: string;
}) {
  return `persist:${clusterName}:${id}`;
}

export async function createClusterPersistServer({
  client,
  id,
  clusterName,
}: {
  client: Client;
  id: string;
  clusterName: string;
}) {
  const service = clusterService({ clusterName, id });
  logger.debug("createClusterPersistServer: ", { service });
  return await createPersistServer({ client, service });
}

export interface ClusterStreams {
  interest: DStream<InterestUpdate>;
  sticky: DStream<StickyUpdate>;
}

export async function clusterStreams({
  client,
  clusterName,
  id,
}: {
  client: Client;
  clusterName: string;
  id: string;
}): Promise<ClusterStreams> {
  logger.debug("clusterStream: ", { clusterName, id });
  if (!clusterName) {
    throw Error("clusterName must be set");
  }
  const names = clusterStreamNames({ clusterName, id });
  const opts = {
    service: clusterService({ clusterName, id }),
    noCache: true,
    ephemeral: true,
  };
  const interest = await client.sync.dstream<InterestUpdate>({
    noInventory: true,
    name: names.interest,
    ...opts,
  });
  const sticky = await client.sync.dstream<StickyUpdate>({
    noInventory: true,
    name: names.sticky,
    ...opts,
  });
  logger.debug("clusterStreams: got them", { clusterName });
  return { interest, sticky };
}

// Periodically delete not-necessary updates from the interest stream
export async function trimClusterStreams(
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
    logger.debug("trimClusterStream: trimming", { seqs });
    for (const seq of seqs) {
      await interest.delete({ seq });
    }
  }
  return seqs;
}
