import getPool from "lib/database";
import { getLogger } from "@cocalc/util-node/logger";

const logger = getLogger("get-vhost-info");

export interface Auth {
  name: string;
  pass: string; // password-hash
}

export type VirtualHostInfo = { [path: string]: Auth[] };

export default async function getVirtualHostInfo(
  host: string
): Promise<
  { project_id: string; path: string; auth: VirtualHostInfo } | undefined
> {
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
    return;
  }
  if (rows.length > 1) {
    logger.warn("WARNING: multiple virtual host entries for host=%s", host);
  }
  const { project_id, path, auth } = rows[0]; // is a weird data type, which is why we don't just return it.
  return { project_id, path, auth };
}
