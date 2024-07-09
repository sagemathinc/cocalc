/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages } from "@cocalc/server/compute/images";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { ensureServiceAccountExists } from "./create";
import { getProjectSpecificId } from "@cocalc/server/compute/project-specific-id";

// last_edited gets updated about this frequently when filesystem actively mounted.
const LAST_EDITED_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const logger = getLogger("server:compute:cloud-filesystem");

export type CloudFilesystemConf = {
  image: string; // docker image to run to setup cloud file system, e.g., 'sagemathinc/cloud-filesystem:1.4'
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
    throw Error(`no cloud file system with id ${id}`);
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
  compute_server_id: number,
): Promise<CloudFilesystem[]> {
  logger.debug("getMountedCloudFilesystems: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM cloud_filesystems WHERE project_id=$1 AND (deleting IS null or deleting=false) AND mount=true`,
    [project_id],
  );
  if (rows.length == 0) {
    return rows;
  }

  // turn rows into normal objects that can be mutated:
  const filesystems: CloudFilesystem[] = rows.map((filesystem) => {
    return { ...filesystem };
  });

  // update last_edited in the database for these filesystems:
  await updateLastEdited(filesystems);

  // create any service accounts that don't exist -- this may mutate rows
  // and do NOT do in parallel since we do not want to encourage a race conditions
  // when setting role bindings.
  // This is expected to be necessary sometimes since we automatically
  // delete service accounts of filesystems that haven't been used recently.
  for (const filesystem of filesystems) {
    await ensureServiceAccountExists(filesystem);
  }

  // fill in the client_id of this compute server
  // The client_id is used to ensure that inodes and slice id's can't overlap between
  // different cloud file system mountpoints, which is critical to avoid corruption.
  // This id would be difficult (impossible?) to assign locally from the mountpoint,
  // but easy to assign here globally, since we have a global view of the system.
  //
  // TODO: For the file system, the assigned client_id's should satisfy 0 <= client_id <= 1023.
  // at least with my current setup.  If you had more than 1023 compute servers in a given
  // project that would break this.  However, I very much doubt juicefs+keydb with a fully connected
  // topology won't have already broken badly well before this limit.  Also probably the
  // vpn stuff as I've set it up wouldn't even work (who knows).  So there will surely be
  // a couple of challenges getting to (and beyond) 1000 compute servers in a single project.
  // Our current users typically use 2 or 3 at most.
  //
  const client_id = await getProjectSpecificId({
    compute_server_id,
    project_id,
  });
  for (const filesystem of filesystems) {
    filesystem["client_id"] = client_id;
  }

  return filesystems;
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
  const filesystems = await getMountedCloudFilesystems(project_id, id);
  const network = await getNetwork(project_id, id);
  return { image, filesystems, network };
}
