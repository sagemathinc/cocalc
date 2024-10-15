/*
This is called periodically by compute servers to check in, thus
proving that they are alive.  The response may contain information
about:

- the wireguard vpn,
- the cloud file system configuration,
- ssh keys that grant access to the compute server -- compute server should write it to '/cocalc/conf/authorized_keys'

It's used by the /api/v2/compute/check-in api endpoint.

     /api/v2/compute/check-in?vpn_sha1=xxx&cloud_filesystem_sha1=xxx

*/
import setDetailedState from "@cocalc/server/compute/set-detailed-state";
import { getVpnConf, VpnConf } from "./vpn";
import {
  getCloudFilesystemConf,
  CloudFilesystemConf,
} from "./cloud-filesystem";
import { sha1 } from "@cocalc/backend/sha1";
import getLogger from "@cocalc/backend/logger";
import { CHECK_IN_PERIOD_S } from "@cocalc/util/db-schema/compute-servers";
import { authorizedKeys } from "@cocalc/server/compute/cloud/install";

const logger = getLogger("server:compute:check-in");

export async function checkIn(opts: {
  // api_key resolves to this project_id:
  project_id: string;
  // claimed id by the compute server
  id: number;
  vpn_sha1?: string;
  cloud_filesystem_sha1?: string;
  authorized_keys_sha1?: string;
}): Promise<{
  vpn?: VpnConf;
  vpn_sha1?: string;
  cloud_filesystem?: CloudFilesystemConf;
  cloud_filesystem_sha1?: string;
  authorized_keys?: string;
  authorized_keys_sha1?: string;
}> {
  logger.debug("checkIn -- ", opts);
  const { project_id, id } = opts;
  let { vpn_sha1, cloud_filesystem_sha1, authorized_keys_sha1 } = opts;

  await setDetailedState({
    project_id,
    id,
    name: "vm",
    state: "ready",
    extra: "",
    timeout: CHECK_IN_PERIOD_S + 15,
    progress: 100,
  });

  let vpn: VpnConf | undefined = undefined,
    cloud_filesystem: CloudFilesystemConf | undefined = undefined;
  const new_vpn = await getVpnConf(project_id);
  const new_vpn_sha1 = sha1(JSON.stringify(new_vpn));
  if (new_vpn_sha1 != vpn_sha1) {
    vpn = new_vpn;
    vpn_sha1 = new_vpn_sha1;
  } else {
    vpn_sha1 = undefined;
  }
  const new_cloud_filesystem = await getCloudFilesystemConf(project_id, id);
  const new_cloud_filesystem_sha1 = sha1(JSON.stringify(new_cloud_filesystem));
  if (new_cloud_filesystem_sha1 != cloud_filesystem_sha1) {
    cloud_filesystem = new_cloud_filesystem;
    cloud_filesystem_sha1 = new_cloud_filesystem_sha1;
  } else {
    cloud_filesystem_sha1 = undefined;
  }

  const new_authorized_keys = await authorizedKeys(project_id);
  const new_authorized_keys_sha1 = sha1(new_authorized_keys);
  let authorized_keys: string | undefined;
  if (new_authorized_keys_sha1 != authorized_keys_sha1) {
    authorized_keys = new_authorized_keys;
    authorized_keys_sha1 = new_authorized_keys_sha1;
  } else {
    authorized_keys = undefined;
  }

  return {
    vpn,
    vpn_sha1,
    cloud_filesystem,
    cloud_filesystem_sha1,
    authorized_keys,
    authorized_keys_sha1,
  };
}
