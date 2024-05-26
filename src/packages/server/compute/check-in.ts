/*
This is called periodically by compute servers to check in, thus
proving that they are alive.  The response may contain information
about the vpn or storage configuration.

It's used by the /api/v2/compute/check-in api endpoint.

     /api/v2/compute/check-in?vpn_sha1=xxx&storage_sha1=xxx
*/
import setDetailedState from "@cocalc/server/compute/set-detailed-state";
import { getVpnConf, VpnConf } from "./vpn";
import { getStorageConf, StorageConf } from "./storage";
import { sha1 } from "@cocalc/backend/sha1";
import getLogger from "@cocalc/backend/logger";

export const CHECK_IN_PERIOD_S = 30;

const logger = getLogger("server:compute:check-in");

export async function checkIn(opts: {
  // api_key resolves to this project_id:
  project_id: string;
  // claimed id by the compute server
  id: number;
  vpn_sha1?: string;
  storage_sha1?: string;
}): Promise<{ vpn?: VpnConf; storage?: StorageConf }> {
  logger.debug("checkIn -- ", opts);
  const { project_id, id, vpn_sha1, storage_sha1 } = opts;

  await setDetailedState({
    project_id,
    id,
    name: "vm",
    state: "ready",
    extra: "",
    timeout: CHECK_IN_PERIOD_S + 5,
    progress: 100,
  });

  let vpn: VpnConf | undefined = undefined,
    storage: StorageConf | undefined = undefined;
  const new_vpn = await getVpnConf(project_id);
  if (!vpn_sha1 || sha1(JSON.stringify(new_vpn)) != vpn_sha1) {
    vpn = new_vpn;
  }
  const new_storage = await getStorageConf(project_id);
  if (!storage_sha1 || sha1(JSON.stringify(new_storage)) != storage_sha1) {
    storage = new_storage;
  }

  return { vpn, storage };
}
