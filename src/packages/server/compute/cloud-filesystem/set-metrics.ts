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

// Determine the network costs for transfering data between
// the given cloud storage bucket and compute server, if possible.
// This is used to provide insight to the user and as a sanity
// check, but not for actually cost determination.
export async function computeNetworkCosts({
  cloud_filesystem_id,
  compute_server_id,
  project_id, // just as an extra security precaution.
}: {
  cloud_filesystem_id: number;
  compute_server_id: number;
  project_id: string;
}): Promise<{ cost_put_gib?: number; cost_get_gib?: number }> {
  // use "long" caching since the cloud filesystem and compute server
  // do not move very often (and again, this is maily for insight)
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
  const {
    rows: [cloud_filesystem],
  } = await pool.query(
    "SELECT bucket_location FROM cloud_filesystems WHERE id=$1 AND project_id=$2",
    [cloud_filesystem_id, project_id],
  );
  if (cloud_filesystem == null) {
    throw Error(
      `no cloud filesystem with id ${cloud_filesystem_id} in project ${project_id}`,
    );
  }
  if (compute_server.configuration.cloud == "google-cloud") {
    const { region } = compute_server.configuration;
    const { bucket_location } = cloud_filesystem;
    if (region == bucket_location) {
      // free!
      return { cost_put_gib: 0, cost_get_gib: 0 };
    } else {
      // complicated -- TODO
    }
  } else if (compute_server.configuration.cloud == "hyperstack") {
    return { cost_put_gib: 0, cost_get_gib: 0.12 };
  } else if (compute_server.configuration.cloud == "onprem") {
    // NOTE: to China is $0.23 and Australia is $0.19 (!)
    // but everywhere else worldwide is $0.12/GB, so we go with that
    // for our user estimate.
    return { cost_put_gib: 0, cost_get_gib: 0.12 };
  }
  // go with same as for on prem
  return { cost_put_gib: 0, cost_get_gib: 0.12 };
}
