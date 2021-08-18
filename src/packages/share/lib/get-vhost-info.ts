import getPool from "./database";
import { getLogger } from "@cocalc/util-node/logger";
import LRU from "lru-cache";

const logger = getLogger("get-vhost-info");

export interface Auth {
  name: string;
  pass: string; // password-hash
}

export type VirtualHostInfo = { [path: string]: Auth[] };

interface HostInfo {
  project_id: string;
  path: string;
  auth: VirtualHostInfo;
}

// This could get called a LOT on the same host that is not special
// for the server, and also the list of public projects that have
// vhost info is very small (e.g., like 3 of them) and at least
// right now only something that is manually changed!  We thus cache
// the answer for 1 minute.  If we change our use of vhosts, we can
// revisit this parameter.

const cache = new LRU<string, HostInfo | null>({
  maxAge: 1000 * 60,
});

export default async function getVirtualHostInfo(
  host: string
): Promise<HostInfo | null> {
  if (cache.has(host)) {
    return cache.get(host);
  }
  logger.debug("host='%s'", host);
  const pool = getPool();

  // Get the database entry that describes the public path with given vhost.
  // NOTE: we are assuming there is at most one with a given vhost.  If there
  // are more, behavior is not defined, but that will get logged.
  const { rows } = await pool.query(
    "SELECT project_id, path, auth FROM public_paths WHERE disabled IS NOT TRUE AND vhost=$1",
    [host]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    logger.debug("no valid virtual host=%s", host);
    cache.set(host, null);
    return null;
  }
  if (rows.length > 1) {
    logger.warn("WARNING: multiple virtual host entries for host=%s", host);
  }
  const { project_id, path, auth } = rows[0]; // is a weird data type, which is why we don't just return it.
  const r = { project_id, path, auth };
  cache.set(host, r);
  return r;
}
