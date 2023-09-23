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

export default async function setServerConfiguration({
  account_id,
  id,
  configuration,
}) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET configuration = COALESCE(configuration, '{}'::jsonb) || $1::jsonb WHERE id=$2 AND account_id=$3 AND state='off'",
    [configuration, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id, state not 'off', or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
}
