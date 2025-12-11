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
  min?: number;
  max?: number; // if given, normalize progress to be between 0 and max instead of 0 and 100.
  error?;
  desc?: string;
  elapsed?: number;
  speed?: string;
  eta?: number;
}

export interface Options extends Event {
  project_id?: string;
  host_id?: string;
  compute_server_id?: number; // legacy
  client?: Client;
  ttl?: number;
}

function getName({
  host_id,
  project_id,
  compute_server_id = 0,
}: {
  host_id?: string;
  project_id?: string;
  compute_server_id?: number;
}) {
  if (host_id) return `bootlog.host.${host_id}`;
  if (project_id) return `bootlog.project.${project_id}`;
  return `bootlog.${compute_server_id}`;
}

export async function resetBootlog({
  project_id,
  host_id,
  compute_server_id = 0,
  client = conat(),
}) {
  const stream = client.sync.astream<Event>({
    project_id,
    name: getName({ host_id, project_id, compute_server_id }),
  });
  try {
    await stream.delete({ all: true });
  } catch (err) {
    logger.debug("ERROR reseting log", {
      project_id,
      host_id,
      compute_server_id,
      err,
    });
  }
}

// publishing is not fatal
// should be a TTL cache ([ ] todo)
const start: { [key: string]: number } = {};
export async function bootlog(opts: Options) {
  const {
    project_id,
    host_id,
    compute_server_id = 0,
    client = conat(),
    ttl = DEFAULT_TTL,
    min = 0,
    max = 100,
    ...event
  } = opts;
  const stream = client.sync.astream<Event>({
    project_id,
    name: getName({ host_id, project_id, compute_server_id }),
  });
  if (event.error != null && typeof event.error != "string") {
    event.error = `${event.error}`;
  }
  const key = `${project_id ?? ""}-${host_id ?? ""}-${compute_server_id}-${event.type}`;
  let progress;
  if (event.progress != null) {
    if (!event.progress) {
      start[key] = Date.now();
      event.elapsed = 0;
    } else if (start[key]) {
      event.elapsed = Date.now() - start[key];
    }
    progress = shiftProgress({ progress: event.progress, min, max });
  } else {
    progress = undefined;
  }
  try {
    await stream.publish({ ...event, progress }, { ttl });
  } catch (err) {
    logger.debug("ERROR publishing to bootlog", {
      project_id,
      host_id,
      compute_server_id,
      err,
    });
  }
}

export function shiftProgress<T extends number | undefined>({
  progress,
  min = 0,
  max = 100,
}: {
  progress: T;
  min?: number;
  max?: number;
}): T extends number ? number : undefined {
  if (progress == null) {
    return undefined as any;
  }
  return Math.round(min + (progress / 100) * (max - min)) as any;
}

// be sure to call .close() on the result when done
export async function get({
  project_id,
  host_id,
  compute_server_id = 0,
  client = conat(),
}: {
  project_id?: string;
  host_id?: string;
  compute_server_id?: number;
  client?: Client;
}): Promise<DStream<Event>> {
  // Prefer project_id if given; otherwise use host_id
  return await client.sync.dstream<Event>({
    project_id,
    name: getName({ host_id, project_id, compute_server_id }),
  });
}
