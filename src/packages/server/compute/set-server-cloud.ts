/*
Set the cloud of a compute server.  The owner is the only one allowed
to do this.

This is a little less easy to implement, since changing the cloud
clears the configuration, as it is not meaningful between clouds.
*/

import getPool from "@cocalc/database/pool";

import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";
import { availableClouds } from "./config";

export default async function setServerCloud({ account_id, id, cloud }) {
  if (CLOUDS_BY_NAME[cloud] == null) {
    // bug or malicious or version issue
    throw Error(`unknown cloud ${cloud}`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT cloud, state, configuration FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows.length == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
  if (rows[0].cloud == cloud) {
    // nothing to do.
    return;
  }
  if ((rows[0].state ?? "deprovisioned") != "deprovisioned") {
    throw Error("can only change the cloud when VM state is 'deprovisioned'");
  }
  let newConfig: any = null;
  if (rows[0].configuration?.cloud == cloud) {
    newConfig = rows[0].configuration;
  } else {
    newConfig = CLOUDS_BY_NAME[cloud]?.defaultConfiguration ?? null;
  }

  const available = await availableClouds();
  if (!available.includes(cloud)) {
    throw Error(
      `the cloud ${cloud} is not configured to use. Configured cloud: ${available.join(
        ", ",
      )}`,
    );
  }

  await pool.query(
    "UPDATE compute_servers SET cloud=$1, configuration=$2 WHERE id=$3 AND account_id=$4",
    [cloud, newConfig, id, account_id],
  );
}
