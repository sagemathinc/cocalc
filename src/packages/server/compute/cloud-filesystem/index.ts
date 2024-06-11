/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages } from "@cocalc/server/compute/images";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { ensureBucketExists, ensureServiceAccountExists } from "./create";

// last_edited gets updated about this frequently when filesystem actively mounted.
const LAST_EDITED_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const logger = getLogger("server:compute:cloud-filesystem");

export type CloudFilesystemConf = {
  image: string; // docker image to run to setup cloud filesystem, e.g., 'sagemathinc/cloud-filesystem:1.4'
  filesystems: CloudFilesystem[];
  network: { interface: string; peers: string[] };
};

export async function getCloudFilesystem(id: number): Promise<CloudFilesystem> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM cloud_filesystems WHERE id=$1`,
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no cloud filesystem with id ${id}`);
  }
  return rows[0];
}

async function updateLastEdited(rows) {
  const cutoff = new Date(Date.now() - LAST_EDITED_UPDATE_INTERVAL_MS);
  const toUpdate = rows.filter((x) => x.last_edited <= cutoff).map((x) => x.id);
  if (toUpdate.length > 0) {
    const pool = getPool();
    await pool.query(
      "UPDATE cloud_filesystems SET last_edited=NOW() WHERE id=ANY($1)",
      [toUpdate],
    );
  }
}

async function getMountedCloudFilesystems(
  project_id: string,
): Promise<CloudFilesystem[]> {
  logger.debug("getMountedCloudFilesystems: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM cloud_filesystems WHERE project_id=$1 AND (deleting IS null or deleting=false) AND mount=true`,
    [project_id],
  );

  // update last_edited in the database for these filesystems:
  await updateLastEdited(rows);
  // create any buckets, if they don't exist -- this may mutate rows.
  // NOTE: this case absolutely should never happen since we create the bucket
  // when creating the filesystem.  However, just in case, we leave it in,
  // since it's a trivial check.
  for (const row of rows) {
    await ensureBucketExists(row);
  }
  // create any service accounts that don't exist -- this may mutate rows
  // and do NOT do in parallel since we do not want to encourage a race conditions
  // when setting role bindings.
  // This is expected to be necessary sometimes since we automatically
  // delete service accounts of filesystems that haven't been used recently.
  for (const row of rows) {
    await ensureServiceAccountExists(row);
  }

  return rows;
}

async function getImageName(): Promise<string> {
  const IMAGES = await getImages();
  const tag = getTag({ image: "cloud-filesystem", IMAGES });
  const pkg =
    IMAGES["cloud-filesystem"]?.package ?? "sagemathinc/cloud-filesystem";
  return `${pkg}:${tag}`;
}

async function getNetwork(
  project_id: string,
  id: number,
): Promise<{ interface: string; peers: string[] }> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT vpn_ip, id
     FROM compute_servers
     WHERE project_id=$1 AND state='running' AND vpn_ip IS NOT NULL AND vpn_ip != ''`,
    [project_id],
  );
  let interface_ = "";
  for (const x of rows) {
    if (x.id == id) {
      interface_ = x.vpn_ip;
      break;
    }
  }
  return {
    interface: interface_,
    peers: rows.filter((row) => row.id != id).map((row) => row.vpn_ip),
  };
}

export async function getCloudFilesystemConf(
  project_id: string,
  id: number,
): Promise<CloudFilesystemConf> {
  logger.debug("getCloudFilesystemConf: ", { project_id });
  const image = await getImageName();
  const filesystems = await getMountedCloudFilesystems(project_id);
  const network = await getNetwork(project_id, id);
  return { image, filesystems, network };
}
