import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/backend/logger";
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
  vhost: string
): Promise<HostInfo | null> {
  if (cache.has(vhost)) {
    //logger.debug("using cache");
    return cache.get(vhost);
  }

  // long: once a vhost is set, it's unlikely to change for a while, since it literally
  // requires updating DNS entries to have any impact.
  const pool = getPool("long");

  // Get the database entry that describes the public path with given vhost.
  // NOTE: we are assuming there is at most one with a given vhost.  If there
  // are more, behavior is not defined, but that will get logged.
  const query =
    "SELECT project_id, path, auth FROM public_paths WHERE disabled IS NOT TRUE AND $1::TEXT=ANY(string_to_array(vhost,','))";
  // logger.debug('query = ', query);
  const { rows } = await pool.query(query, [vhost]);
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    // logger.debug("no valid virtual vhost=%s", vhost);
    cache.set(vhost, null);
    return null;
  }
  if (rows.length > 1) {
    logger.warn("WARNING: multiple virtual host entries for vhost=%s", vhost);
  }
  const { project_id, path, auth } = rows[0]; // is a weird data type, which is why we don't just return it.
  const r = { project_id, path, auth };
  cache.set(vhost, r);
  return r;
}
