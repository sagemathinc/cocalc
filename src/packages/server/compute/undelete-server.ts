/*
Undelete the compute server.
*/

import getPool from "@cocalc/database/pool";
import { isDnsAvailable } from "./dns";

export default async function undeleteServer({ account_id, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, deleted, configuration->>'dns' AS dns FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error("no such compute server");
  }
  if (rows[0].account_id != account_id) {
    throw Error("you must be the owner of the compute server to delete it");
  }
  if (!rows[0].deleted) {
    // already not deleted
    return;
  }
  const dns = rows[0].dns;
  if (dns && !(await isDnsAvailable(dns))) {
    throw Error(
      `The dns name '${dns}' is taken by another compute server.  Edit the settings of this deleted compute server and change 'DNS: Custom Subdomain' to a different subdomain then try to undelete the server.`,
    );
  }

  // do not just set deleted to null, since we want changefeed to update synctable
  // and it doesn't with deleted=null.
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET deleted=false, last_edited=NOW() WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to undelete compute server by a non-owner, which is not allowed.",
    );
  }
}
