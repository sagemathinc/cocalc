import ConsistentHash from "consistent-hash";
import { hash_string } from "@cocalc/util/misc";
import { type Client } from "./client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:core:sticky");

export function consistentHashingChoice(
  v: Set<string>,
  resource: string,
): string {
  if (v.size == 0) {
    throw Error("v must have size at least 1");
  }
  if (v.size == 1) {
    for (const x of v) {
      return x;
    }
  }
  const hr = new ConsistentHash({ distribution: "uniform" });
  const w = Array.from(v);
  w.sort();
  for (const x of w) {
    hr.add(x);
  }
  // we hash the resource so that the values are randomly distributed even
  // if the resources look very similar (e.g., subject.1, subject.2, etc.)
  // I thought that "consistent-hash" hashed the resource, but it doesn't really.
  return hr.get(hash_string(resource));
}

const SUBJECT = "sticky.one";
const DEFAULT_TTL = 15_000;

export function stickyKey({ pattern, subject }) {
  return pattern + " " + subject;
}

export function getStickyTarget({
  stickyCache,
  pattern,
  subject,
}: {
  stickyCache: { [key: string]: { target: string; expire: number } };
  pattern: string;
  subject: string;
}): string | undefined {
  const key = stickyKey({ pattern, subject });
  const x = stickyCache[key];
  if (x != null) {
    if (Date.now() <= x.expire) {
      // it's in the cache
      return x.target;
    } else {
      delete stickyCache[key];
    }
  }
  // not in the cache or expired
  return undefined;
}

export async function createStickyRouter({ client }: { client: Client }) {
  const sub = await client.subscribe(SUBJECT);
  const stickyCache: { [key: string]: { target: string; expire: number } } = {};

  const handle = async (mesg) => {
    try {
      const { pattern, subject, targets } = mesg.data;
      const key = stickyKey({ pattern, subject });
      let target = getStickyTarget({
        stickyCache,
        pattern,
        subject,
      });
      if (target == null || !targets.includes(target)) {
        // make a new choice
        target = consistentHashingChoice(targets, subject);
        stickyCache[key] = { target, expire: Date.now() + DEFAULT_TTL };
      }
      await mesg.respond({ target, ttl: DEFAULT_TTL });
    } catch (err) {
      logger.debug("WARNING: unable to handle routing message", err);
    }
  };
  const listen = async () => {
    for await (const mesg of sub) {
      handle(mesg);
    }
  };
  listen();
}

const stickyRequest = reuseInFlight(
  async (
    client: Client,
    {
      subject,
      pattern,
      targets,
    }: {
      subject: string;
      pattern: string;
      targets: string[];
    },
  ) => {
    return await client.request(SUBJECT, {
      pattern,
      subject,
      targets,
    });
  },
  {
    createKey: (args) =>
      args[0].id + " " + args[1].subject + " " + args[1].pattern,
  },
);

export async function stickyChoice({
  client,
  subject,
  pattern,
  targets,
  updateSticky,
  getStickyTarget,
}: {
  client: Client;
  subject: string;
  pattern: string;
  targets: Set<string>;
  updateSticky;
  getStickyTarget: (opts: {
    pattern: string;
    subject: string;
  }) => string | undefined;
}): Promise<string> {
  const v = subject.split(".");
  subject = v.slice(0, v.length - 1).join(".");
  const currentTarget = getStickyTarget({ pattern, subject });
  if (currentTarget === undefined || !targets.has(currentTarget)) {
    const resp = await stickyRequest(client, {
      pattern,
      subject,
      targets: Array.from(targets),
    });
    const { target, ttl = DEFAULT_TTL } = resp.data;
    updateSticky({ pattern, subject, target, ttl });
    return target;
  }
  return currentTarget;
}
