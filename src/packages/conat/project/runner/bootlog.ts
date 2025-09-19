/*
Logging boot up of a project.
*/

import { type Client } from "@cocalc/conat/core/client";
import { type DStream } from "@cocalc/conat/sync/dstream";
import { getLogger } from "@cocalc/conat/client";
import { conat } from "@cocalc/conat/client";

const logger = getLogger("conat:project:runner:bootlog");

// one hour
const DEFAULT_TTL = 1000 * 60 * 60;

export interface Event {
  type: string;
  progress?: number;
  error?;
  desc?: string;
  elapsed?: number;
  speed?: string;
  eta?: number;
}

export interface Options extends Event {
  project_id: string;
  compute_server_id?: number;
  client?: Client;
  ttl?: number;
}

function getName({ compute_server_id = 0 }: { compute_server_id: number }) {
  return `bootlog.${compute_server_id}`;
}

// publishing is not fatal
// should be a TTL cache ([ ] todo)
const start: { [key: string]: number } = {};
export async function bootlog(opts: Options) {
  const {
    project_id,
    compute_server_id = 0,
    client = conat(),
    ttl = DEFAULT_TTL,
    ...event
  } = opts;
  const stream = client.sync.astream<Event>({
    project_id,
    name: getName({ compute_server_id }),
  });
  if (event.error != null && typeof event.error != "string") {
    event.error = `${event.error}`;
  }
  const key = `${project_id}-${compute_server_id}-${event.type}`;
  if (event.progress != null) {
    if (!event.progress) {
      start[key] = Date.now();
      event.elapsed = 0;
    } else if (start[key]) {
      event.elapsed = Date.now() - start[key];
    }
  }
  try {
    await stream.publish(event, { ttl });
  } catch (err) {
    logger.debug("ERROR publishing to bootlog", {
      project_id,
      compute_server_id,
      err,
    });
  }
}

// be sure to call .close() on the result when done
export async function get({
  project_id,
  compute_server_id = 0,
  client = conat(),
}: {
  project_id: string;
  compute_server_id?: number;
  client?: Client;
}): Promise<DStream<Event>> {
  return await client.sync.dstream<Event>({
    project_id,
    name: getName({ compute_server_id }),
  });
}
