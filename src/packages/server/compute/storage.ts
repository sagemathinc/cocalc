/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages } from "@cocalc/server/compute/images";
import type { Storage } from "@cocalc/util/db-schema/storage";

const logger = getLogger("server:compute:storage");

export type StorageConf = {
  image: string; // docker image to run to setup vpn, e.g., 'sagemathinc/vpn:1.4'
  filesystems: Storage[];
  network: { interface: string; peers: string[] };
};

export async function getStorage(id: number): Promise<Storage> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM storage WHERE id=$1`, [id]);
  if (rows.length == 0) {
    throw Error(`no storage with id ${id}`);
  }
  return rows[0];
}

async function getMountedStorageFilesystems(
  project_id: string,
): Promise<Storage[]> {
  logger.debug("getStorageFilesystems: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM storage WHERE project_id=$1 AND (deleted IS null or deleted=false) AND mount=true AND secret_key IS NOT NULL`,
    [project_id],
  );
  // TODO: we may have to address issues here with service account keys expiring, and
  // maybe with collaborators on a project.
  return rows;
}

async function getStorageImage(): Promise<string> {
  const IMAGES = await getImages();
  const tag = getTag({ image: "storage", IMAGES });
  const pkg = IMAGES["storage"]?.package ?? "sagemathinc/storage";
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

export async function getStorageConf(
  project_id: string,
  id: number,
): Promise<StorageConf> {
  logger.debug("getStorageConf: ", { project_id });
  const image = await getStorageImage();
  const filesystems = await getMountedStorageFilesystems(project_id);
  const network = await getNetwork(project_id, id);
  return { image, filesystems, network };
}
