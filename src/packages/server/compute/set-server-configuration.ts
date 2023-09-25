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
  const { rows } = await pool.query(
    "SELECT state, configuration FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows.length == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }

  // These checks below for deleted state are *critical*.  Otherwise, we could easily end up
  // with multiple VM's left running in multiple zones/rgions (on our dime) and data loss.
  // Instead don't allow such a change.  Also, of course, frontend UI will have the same constraint.
  if ((rows[0].state ?? "deleted") != "deleted") {
    if (configuration.region != rows[0].region) {
      throw Error(
        "cannot change the region unless VM is in the 'deleted' state",
      );
    }
    if (configuration.zone != rows[0].zone) {
      throw Error("cannot change the zone unless VM is in the 'deleted' state");
    }
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
