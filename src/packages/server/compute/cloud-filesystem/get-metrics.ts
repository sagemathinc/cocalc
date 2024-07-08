import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const logger = getLogger("server:compute:cloud-filesystem:get-metrics");

export default async function getMetrics({
  cloud_filesystem_id,
  account_id,
  limit,
  offset,
}: {
  cloud_filesystem_id: number;
  account_id: string;
  limit?: number;
  offset?: number;
}) {
  logger.debug({ cloud_filesystem_id, account_id, limit, offset });
  const pool = getPool();
  const {
    rows: [{ project_id }],
  } = await pool.query("SELECT project_id FROM cloud_filesystems WHERE id=$1", [
    cloud_filesystem_id,
  ]);
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error(
      "user must be collaborator on the project that contains the cloud file system",
    );
  }
  const { rows } = await pool.query(
    "SELECT (EXTRACT(EPOCH FROM timestamp) * 1000)::double precision AS timestamp, compute_server_id, bytes_used::double precision, process_uptime::double precision, bytes_put::double precision, bytes_get::double precision, objects_put::double precision, objects_get::double precision, objects_delete::double precision, bucket_location, bucket_storage_class, compute_server_location, cost  FROM cloud_filesystem_metrics WHERE cloud_filesystem_id=$1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3",
    [cloud_filesystem_id, limit ?? 1000, offset ?? 0],
  );
  return rows;
}
