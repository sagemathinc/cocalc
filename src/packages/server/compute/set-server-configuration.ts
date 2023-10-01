/*
Set a compute server's configuration.

This can ONLY be changed then the compute_server is in the off state,
and it can ONLY be changed the owner of the compute_server.

However, we do NOT check that the configuration is valid.  The frontend
may attempt to ensure that, but it's fully this backends responsibility
when starting the server to return an error if the configuration is not
valid.  Basically, storing a valid configuraiton in an OFF compute server
is allowed.

This also shallow merges in configuration via postgresql COALESCE, so if you set
the configuration to {zone:'foo'} that doesn't delete the rest of the configuration.
*/

import getPool from "@cocalc/database/pool";
import {
  makeConfigurationChange,
  validateConfigurationChange,
} from "./control";
import type { Configuration } from "@cocalc/util/db-schema/compute-servers";

export default async function setServerConfiguration({
  account_id,
  id,
  configuration, // really the partial of changes
}: {
  account_id: string;
  id: number;
  configuration: Partial<Configuration>;
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT state, cloud, configuration FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows.length == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }

  const { cloud, state, configuration: currentConfiguration } = rows[0];

  await validateConfigurationChange({
    cloud,
    state,
    currentConfiguration,
    changes: configuration,
  });

  if (state != "deprovisioned") {
    // A big worry would be if the user could somehow trick the system into
    // making config changes to the provisioned VM, but this still throws an
    // exception, so they can get something for free.  However, we will also
    // sync the provisioned state back to our database regularly, thus updating
    // the configuration.  Still, it is something to worry about.
    await makeConfigurationChange({
      id,
      cloud,
      state,
      currentConfiguration,
      changes: configuration,
    });
  }

  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET configuration = COALESCE(configuration, '{}'::jsonb) || $1::jsonb WHERE id=$2 AND account_id=$3",
    [configuration, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id, or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
}
