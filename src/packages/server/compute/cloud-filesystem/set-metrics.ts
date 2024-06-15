import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const logger = getLogger("server:compute:cloud-filesystem:set-metrics");

export default async function setMetrics(opts: {
  project_id: string;
  cloud_filesystem_id: number;
  compute_server_id: number;
  process_uptime: number;
  bytes_get?: number;
  bytes_put?: number;
  bytes_used?: number;
  objects_get?: number;
  objects_put?: number;
  objects_delete?: number;
}) {
  const pool = getPool();
  logger.debug(opts);

  const {
    project_id,
    cloud_filesystem_id,
    compute_server_id,
    process_uptime,
    bytes_get,
    bytes_put,
    bytes_used,
    objects_get,
    objects_put,
    objects_delete,
  } = opts;

  // The project_id is determined from the secret api key, so we can trust it is correct.
  // However, the user could still use it to submit data about a random filesystem, which
  // would vandalize our metrics, so we do a consistency check to make certain we only
  // collect an allowed metric:
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM cloud_filesystems WHERE id=$1 AND project_id=$2 AND mount=true",
    [cloud_filesystem_id, project_id],
  );
  if (rows[0].count != 1) {
    throw Error("cloud filesystem must be mounted on the given project");
  }
  // Of course, the client could put nonsense data in here or the wrong compute server id.
  // That's fine and part of our security model -- we use this data entirely to provide realtime
  // user insight into their filesystem usage, and double check it with other data later
  // for purchasing purposes.  The idea is that a user can only shoot themselves in the foot.

  await pool.query(
    "INSERT INTO cloud_filesystem_metrics(timestamp,cloud_filesystem_id,compute_server_id,process_uptime,bytes_get,bytes_put,bytes_used,objects_get,objects_put,objects_delete) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      cloud_filesystem_id,
      compute_server_id,
      process_uptime,
      bytes_get,
      bytes_put,
      bytes_used,
      objects_get,
      objects_put,
      objects_delete,
    ],
  );
}
