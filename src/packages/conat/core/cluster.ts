import { type Client, connect } from "./client";
import { Patterns } from "./patterns";
import {
  updateInterest,
  updateSticky,
  type InterestUpdate,
  type StickyUpdate,
} from "@cocalc/conat/core/server";
import type { DStream } from "@cocalc/conat/sync/dstream";
import { once } from "@cocalc/util/async-utils";
import { server as createPersistServer } from "@cocalc/conat/persist/server";
import { getLogger } from "@cocalc/conat/client";
import { hash_string } from "@cocalc/util/misc";
const CREATE_LINK_TIMEOUT = 45_000;

const logger = getLogger("conat:core:cluster");

export async function clusterLink(
  address: string,
  systemAccountPassword: string,
  updateStickyLocal: (sticky: StickyUpdate) => void,
  timeout = CREATE_LINK_TIMEOUT,
) {
  const client = connect({ address, systemAccountPassword });
  if (client.info == null) {
    try {
      await client.waitUntilSignedIn({
        timeout: timeout ?? CREATE_LINK_TIMEOUT,
      });
    } catch (err) {
      client.close();
      throw err;
    }
    if (client.info == null) {
      // this is impossible
      throw Error("BUG -- failed to sign in");
    }
  }
  const { id, clusterName } = client.info;
  if (!id) {
    throw Error("id must be specified");
  }
  if (!clusterName) {
    throw Error("clusterName must be specified");
  }
  const link = new ClusterLink(
    client,
    id,
    clusterName,
    address,
    updateStickyLocal,
  );
  await link.init();
  return link;
}

export type Sticky = { [pattern: string]: { [subject: string]: string } };
export type Interest = Patterns<{ [queue: string]: Set<string> }>;

export { type ClusterLink };

class ClusterLink {
  public interest: Interest = new Patterns();
  private sticky: Sticky = {};
  private streams: ClusterStreams;
  private state: "init" | "ready" | "closed" = "init";
  private clientStateChanged = Date.now(); // when client status last changed

  constructor(
    public readonly client: Client,
    public readonly id: string,
    public readonly clusterName: string,
    public readonly address: string,
    private readonly updateStickyLocal: (sticky: StickyUpdate) => void,
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
    this.client.on("connected", this.handleClientStateChanged);
    this.client.on("disconnected", this.handleClientStateChanged);
    this.streams = await clusterStreams({
      client: this.client,
      id: this.id,
      clusterName: this.clusterName,
    });
    for (const update of this.streams.interest.getAll()) {
      updateInterest(update, this.interest, this.sticky);
    }
    for (const update of this.streams.sticky.getAll()) {
      updateSticky(update, this.sticky);
    }
    // I have a slight concern about this because updates might not
    // arrive in order during automatic failover.  That said, maybe
    // automatic failover doesn't matter with these streams, since
    // it shouldn't really happen -- each stream is served from the server
    // it is about, and when that server goes down none of this state
    // matters anymore.
    this.streams.interest.on("change", this.handleInterestUpdate);
    this.streams.sticky.on("change", this.handleStickyUpdate);
    this.state = "ready";
  };

  isConnected = () => {
    return this.client.state == "connected";
  };

  handleInterestUpdate = (update: InterestUpdate) => {
    updateInterest(update, this.interest, this.sticky);
  };

  handleStickyUpdate = (update: StickyUpdate) => {
    updateSticky(update, this.sticky);
    this.updateStickyLocal(update);
  };

  private handleClientStateChanged = () => {
    this.clientStateChanged = Date.now();
  };

  howLongDisconnected = () => {
    if (this.isConnected()) {
      return 0;
    }
    return Date.now() - this.clientStateChanged;
  };

  close = () => {
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    this.client.removeListener("connected", this.handleClientStateChanged);
    this.client.removeListener("disconnected", this.handleClientStateChanged);
    if (this.streams != null) {
      this.streams.interest.removeListener("change", this.handleInterestUpdate);
      this.streams.interest.close();
      this.streams.sticky.close();
      // @ts-ignore
      delete this.streams;
    }
    this.client.close();
    // @ts-ignore
    delete this.client;
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

  hash = (): { interest: number; sticky: number } => {
    return {
      interest: hashInterest(this.interest),
      sticky: hashSticky(this.sticky),
    };
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
    links: { interest: Patterns<{ [queue: string]: Set<string> }> }[];
  },
  // don't delete anything that isn't at lest minAge ms old.
  minAge: number,
): Promise<{ seqsInterest: number[]; seqsSticky: number[] }> {
  const { interest, sticky } = streams;
  // First deal with interst
  // we iterate over the interest stream checking for subjects
  // with no current interest at all; in such cases it is safe
  // to purge them entirely from the stream.
  const seqs: number[] = [];
  const now = Date.now();
  for (let n = 0; n < interest.length; n++) {
    const time = interest.time(n);
    if (time == null) continue;
    if (now - time.valueOf() <= minAge) {
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
    logger.debug("trimClusterStream: trimming interest", { seqs });
    for (const seq of seqs) {
      await interest.delete({ seq });
    }
  }

  // Next deal with sticky -- trim ones where the pattern is no longer of interest.
  // There could be other reasons to trim but it gets much trickier. This one is more
  // obvious, except we have to check for any interest in the whole cluster, not
  // just this node.
  const seqs2: number[] = [];
  function noInterest(pattern: string) {
    if (data.interest.hasPattern(pattern)) {
      return false;
    }
    for (const link of data.links) {
      if (link.interest.hasPattern(pattern)) {
        return false;
      }
    }
    // nobody cares
    return true;
  }
  for (let n = 0; n < sticky.length; n++) {
    const time = sticky.time(n);
    if (time == null) continue;
    if (now - time.valueOf() <= minAge) {
      break;
    }
    const update = sticky.get(n) as StickyUpdate;
    if (noInterest(update.pattern)) {
      const seq = sticky.seq(n);
      if (seq != null) {
        seqs2.push(seq);
      }
    }
  }
  if (seqs2.length > 0) {
    // [ ] todo -- add to interest.delete a version where it takes an array of sequence numbers
    logger.debug("trimClusterStream: trimming sticky", { seqs2 });
    for (const seq of seqs2) {
      await sticky.delete({ seq });
    }
  }

  return { seqsInterest: seqs, seqsSticky: seqs2 };
}

function hashSet(X: Set<string>): number {
  let h = 0;
  for (const a of X) {
    h += hash_string(a); // integers, and not too many, so should commute
  }
  return h;
}

function hashInterestValue(X: { [queue: string]: Set<string> }): number {
  let h = 0;
  for (const queue in X) {
    h += hashSet(X[queue]); // integers, and not too many, so should commute
  }
  return h;
}

export function hashInterest(
  interest: Patterns<{ [queue: string]: Set<string> }>,
): number {
  return interest.hash(hashInterestValue);
}

export function hashSticky(sticky: Sticky): number {
  let h = 0;
  for (const pattern in sticky) {
    h += hash_string(pattern);
    const x = sticky[pattern];
    for (const subject in x) {
      h += hash_string(x[subject]);
    }
  }
  return h;
}
