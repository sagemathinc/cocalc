import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const logger = getLogger("server:compute:cloud-filesystem:set-metrics");

export default async function setMetrics(opts: {
  project_id: string;
  cloud_filesystem_id: number;
  compute_server_id: number;
  process_uptime: number;
  bytes_used: number;
  bytes_get?: number;
  bytes_put?: number;
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
    throw Error("cloud file system must be mounted on the given project");
  }
  // Of course, the client could put nonsense data in here or the wrong compute server id.
  // That's fine and part of our security model -- we use this data entirely to provide realtime
  // user insight into their filesystem usage, and double check it with other data later
  // for purchasing purposes.  The idea is that a user can only shoot themselves in the foot.

  const { bucket_location, bucket_storage_class, compute_server_location } =
    await computeCurrentConfiguration({
      cloud_filesystem_id,
      compute_server_id,
      project_id,
    });

  await pool.query(
    "INSERT INTO cloud_filesystem_metrics(timestamp,cloud_filesystem_id,compute_server_id,process_uptime,bytes_get,bytes_put,bytes_used,objects_get,objects_put,objects_delete,bucket_location,bucket_storage_class,compute_server_location) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
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
      bucket_location,
      bucket_storage_class,
      compute_server_location,
    ],
  );

  if (bytes_used != null) {
    await pool.query("UPDATE cloud_filesystems SET bytes_used=$1 WHERE id=$2", [
      bytes_used,
      cloud_filesystem_id,
    ]);
  }
}

// Determine the network costs for transfering data between
// the given cloud storage bucket and compute server, if possible.
// This is used to provide insight to the user and as a sanity
// check, but not for actually cost determination.
export async function computeCurrentConfiguration({
  cloud_filesystem_id,
  compute_server_id,
  project_id, // just as an extra security precaution.
}: {
  cloud_filesystem_id: number;
  compute_server_id: number;
  project_id: string;
}): Promise<{
  bucket_location: string;
  bucket_storage_class: string;
  compute_server_location: string;
}> {
  // use "long" caching since the cloud file system and compute server
  // do not move very often (and again, this is mainly for insight and consistency)
  const pool = getPool("long");
  const {
    rows: [compute_server],
  } = await pool.query(
    "SELECT configuration FROM compute_servers WHERE id=$1 AND project_id=$2",
    [compute_server_id, project_id],
  );
  if (compute_server == null) {
    throw Error(
      `no compute server with id ${compute_server_id} in project ${project_id}`,
    );
  }

  let compute_server_location = "unknown";
  if (compute_server.configuration.cloud == "google-cloud") {
    compute_server_location = compute_server.configuration.region;
  } else if (compute_server.configuration.cloud == "hyperstack") {
    compute_server_location = "world";
  } else if (compute_server.configuration.cloud == "onprem") {
    // for now, though soon we should let user specify this
    compute_server_location = "unknown";
  }

  const {
    rows: [cloud_filesystem],
  } = await pool.query(
    "SELECT bucket_location, bucket_storage_class FROM cloud_filesystems WHERE id=$1 AND project_id=$2",
    [cloud_filesystem_id, project_id],
  );
  if (cloud_filesystem == null) {
    throw Error(
      `no cloud file system with id ${cloud_filesystem_id} in project ${project_id}`,
    );
  }
  const { bucket_location, bucket_storage_class } = cloud_filesystem;
  return {
    compute_server_location,
    bucket_location,
    bucket_storage_class,
  };
}
