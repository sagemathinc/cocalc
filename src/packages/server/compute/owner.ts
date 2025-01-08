/*
Transfer ownership of a compute server.  The owner of a compute
server can transfer ownership of the server to any other collaborator
on the project.  Transfering can only be done when the compute server
is off, and is only complete when the recipient explicitly accepts.

Explicitly accepting the transfer is needed because the compute server
constantly costs money if it is any state besides "deprovisioned".

We have to worry about:

- the recipient having credit on their account to cover the costs,
- the recipient being aware that by accepting the transfer, they start getting charged
- what happens to allow collaborator control?  maybe recipient wants to disable it to
  avoid surprise charge.
- how this communication all happens.

NOTE: Obviously we can't just allow any transfer without explicit confirmation!
E.g., user A could add random user B to their project, have collab control set,
and transfer ownership of their $100/hour compute server to user B, and just
spend all of user B's money!  Even without collab control enabled, a compute server with
a large disk could cost $100/hour when off, so the above problem still applies.
The only safe thing would be transfering a deprovisioned server, which is pointless.
*/

import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function transferOwnership({
  account_id,
  id,
  target_account_id,
}: {
  account_id: string;
  id: number;
  target_account_id: string;
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) as count FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows.length == 0 || !rows[0].count) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
  // TODO
  throw Error(`transfer to ${target_account_id} not implemented`);
}

// checks that account_id is a collab on the project that contains the compute server,
// and if so, returns the owner of the compute server.
export async function getOwner({
  compute_server_id,
  account_id,
}: {
  compute_server_id: number;
  account_id: string;
}): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT account_id, project_id FROM compute_servers WHERE id=$1`,
    [compute_server_id],
  );
  if (rows.length == 0) {
    // no such server, so nothing to do
    return account_id;
  }
  if (rows[0].account_id != account_id) {
    const { project_id } = rows[0];
    // check that requesting user has access to compute server's project:
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error(
        "user must be collaborator on project that contains the compute server",
      );
    }
  }
  return rows[0].account_id;
}
