/*
All compute servers in a single project are put on the same encrypted private VPN,
using wireguard.

We use the CIDR range    10.11.0.0/16   with ip addresses

     10.11.0.0  to   10.11.255.255   (65536 ips)

When a new compute server in a project is created, we generate
a RANDOM ip address in the above range, then check the database
to see if it is available (and retry if not). Then we create
the server and set the vpn_ip field in the database.  There's
a very small chance of a race condition, but we also have a unique
index on the compute_servers table so a race condition would result
in an error on creating the compute server.  So we never end up
with bad data.

TODO: Gracefully handle the race condition.  We don't because it is
so unlikely.

NOTE: We are really hardcoding this VPN CIDR.  It works fine
for GCP, Hyperstacks, multipass, etc., but could be a problem
someday, possibly, with some random cloud.  If that happens,
we would perhaps add some configuration to the project itself.
*/

import getPool from "@cocalc/database/pool";
import type { Cloud } from "@cocalc/util/db-schema/compute-servers";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages } from "@cocalc/server/compute/images";

const PREFIX = "10.11.";

function randomVpnIp() {
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  return `${PREFIX}${octet2}.${octet3}`;
}

export async function getAvailableVpnIp(project_id: string) {
  const pool = getPool();
  for (let i = 0; i < 100; i++) {
    const vpn_ip = randomVpnIp();
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM compute_servers WHERE project_id=$1 AND vpn_ip=$2",
      [project_id, vpn_ip],
    );
    if (rows[0].count == 0) {
      return vpn_ip;
    }
  }
  // this should never happen because there are 65K possibilities...
  throw Error(
    `BUG -- unable to find an available vpn ip address for project_id=${project_id}`,
  );
}

// Since we are adding the vpn, there may be existing compute servers without
// a VPN ip set.
export async function ensureComputeServerHasVpnIp(id: number) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT vpn_ip, project_id FROM compute_servers WHERE id=$1",
    [id],
  );
  if (!rows[0].vpn_ip) {
    await pool.query("UPDATE compute_servers SET vpn_ip=$1 WHERE id=$2", [
      await getAvailableVpnIp(rows[0].project_id),
      id,
    ]);
  }
}

interface Node {
  id: number;
  cloud: Cloud;
  dns?: string;
  vpn_ip: string;
  private_key: string;
  public_key: string;
  internal_ip?: string;
  external_ip?: string;
}

export type VpnConf = {
  image: string; // docker image to run to setup vpn, e.g., 'sagemathinc/vpn:1.4'
  nodes: Node[];
};

async function getVpnNodes(project_id: string): Promise<Node[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT cloud, id as compute_server_id, project_specific_id, configuration->>'dns' AS dns,
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
        [privateKey, publicKey, row.compute_server_id],
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
        row.compute_server_id,
      ]);
      row = { ...row, vpn_ip };
    }
    nodes.push(row);
  }

  return nodes;
}

async function getVpnImage(): Promise<string> {
  const IMAGES = await getImages();
  const tag = getTag({ image: "vpn", IMAGES });
  const pkg = IMAGES["vpn"]?.package ?? "sagemathinc/vpn";
  return `${pkg}:${tag}`;
}

export async function getVpnConf(project_id: string): Promise<VpnConf> {
  const image = await getVpnImage();
  const nodes = await getVpnNodes(project_id);
  return { image, nodes };
}

import _sodium from "libsodium-wrappers";
import { fromByteArray } from "base64-js";
export async function generateWireGuardKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  await _sodium.ready;
  const sodium = _sodium;

  // Generate a new key pair
  const privateKey = sodium.crypto_box_seed_keypair(
    sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES),
  );
  const publicKey = sodium.crypto_scalarmult_base(privateKey.privateKey);
  const privateKeyStr = fromByteArray(privateKey.privateKey);
  const publicKeyStr = fromByteArray(publicKey);

  return { privateKey: privateKeyStr, publicKey: publicKeyStr };
}
