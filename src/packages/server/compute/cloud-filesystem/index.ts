/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages } from "@cocalc/server/compute/images";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";

// last_edited gets updated about this frequently when filesystem actively mounted.
const LAST_EDITED_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

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

async function getMountedCloudFilesystems(
  project_id: string,
): Promise<CloudFilesystem[]> {
  logger.debug("getMountedCloudFilesystems: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM cloud_filesystems WHERE project_id=$1 AND (deleting IS null or deleting=false) AND mount=true AND secret_key IS NOT NULL`,
    [project_id],
  );
  const cutoff = new Date(Date.now() - LAST_EDITED_UPDATE_INTERVAL_MS);
  const toUpdate = rows.filter((x) => x.last_edited <= cutoff).map((x) => x.id);
  if (toUpdate.length > 0) {
    await pool.query(
      "UPDATE cloud_filesystems SET last_edited=NOW() WHERE id=ANY($1)",
      [toUpdate],
    );
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
