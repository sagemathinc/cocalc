/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:storage");

export type StorageConf = any[];

export async function getStorageConf(project_id: string): Promise<StorageConf> {
  logger.debug("getStorageConf: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT cloud, id, configuration->>'dns' AS dns,
  vpn_ip, vpn_private_key AS private_key, vpn_public_key AS public_key,
  data->>'externalIp' AS external_ip, data->>'internalIp' AS internal_ip
  FROM compute_servers
  WHERE project_id=$1 AND state='running'`,
    [project_id],
  );
  // fill in any missing vpn info
  const nodes: Node[] = [];
  for (let row of rows) {
    if (!row.private_key || !row.public_key) {
      const { privateKey, publicKey } = await generateWireGuardKeyPair();
      await pool.query(
        "UPDATE compute_servers SET vpn_private_key=$1, vpn_public_key=$2 WHERE id=$3",
        [privateKey, publicKey, row.id],
      );
      row = { ...row, private_key: privateKey, public_key: publicKey };
    }
    if (!row.vpn_ip) {
      // I didn't combine this with the above key check, since this should
      // never happen, since vpn_ip is set when the compute server is created,
      // and also when it is started.
      const vpn_ip = await getAvailableVpnIp(project_id);
      await pool.query("UPDATE compute_servers SET vpn_ip=$1 WHERE id=$2", [
        vpn_ip,
        row.id,
      ]);
      row = { ...row, vpn_ip };
    }
    nodes.push(row);
  }

  return nodes;
}
