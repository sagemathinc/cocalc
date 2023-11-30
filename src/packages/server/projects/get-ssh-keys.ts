/*
Return all public ssh keys that grant access to a specific project.
These are all global ssh keys of all project collaborators and
also all ssh keys specifically added to the project by any user.

NOTE: There is a Python variant of this in the kucalc source
code in addons/ssh-gateway/image/db.py

Ssh keys for a project are stored in two places:

- the ssh_keys field of the accounts table.  This is a JSONB map

    {[fingerprint:string]:{title:string;value:'the actual public key'}}

- in the users field of the projects table is a JSONB map

    {[account_id]:{ssh_keys:{[fingerprint:string]:{title:string;value:'the actual public key'}}}, ...}

The projects table has as primary key the project_id and the accounts table has primary key
account_id, and both are uuid v4's.
*/

import getPool from "@cocalc/database/pool";

interface Key {
  title: string;
  value: string;
  creation_date: number;
  account_id: string;
}

type Keys = { [fingerprint: string]: Key };

export default async function sshKeys(project_id: string): Promise<Keys> {
  const keys: Keys = {};
  const pool = getPool();

  // We will use this implementation involving two queries in parallel,
  // one for the project keys and one for the account-wide keys.  See
  // comment below for a single query that is a bazillion times slower.
  const projectKeys = async () => {
    const { rows } = await pool.query(
      "SELECT users FROM projects WHERE project_id=$1",
      [project_id],
    );
    if (rows.length == 0) {
      // no such project so no keys
      return keys;
    }
    const { users } = rows[0];
    if (users == null) {
      return keys;
    }
    for (const account_id in users) {
      const { ssh_keys } = users[account_id];
      if (ssh_keys != null) {
        for (const fingerprint in ssh_keys) {
          keys[fingerprint] = { ...ssh_keys[fingerprint], account_id };
        }
      }
    }
  };
  const accountKeys = async () => {
    // doing it this way (with a subsquery) is fast, and avoids having
    // to send a potentially large number of account_id's back, and allows
    // us to run the two queries in parallel.
    const { rows } = await pool.query(
      `SELECT account_id, ssh_keys
FROM accounts
WHERE account_id = ANY (
   SELECT jsonb_object_keys(users)::UUID
   FROM projects
   WHERE project_id=$1
)
AND ssh_keys IS NOT NULL AND ssh_keys != '{}'::JSONB`,
      [project_id],
    );
    for (const { account_id, ssh_keys } of rows) {
      for (const fingerprint in ssh_keys) {
        keys[fingerprint] = { ...ssh_keys[fingerprint], account_id };
      }
    }
  };

  await Promise.all([projectKeys(), accountKeys()]);

  return keys;

  /*
  // Let the following be a lesson to you, dear reader!
  // The following is a nice clean simple query and implementation, but
  // I tried it in production on cocalc.com, and due to lack of indexes
  // etc., it is INSANELY SLOW -- I killed it after 20 seconds, and maybe
  // it would have brought down the house, whereas the above takes less
  // than 2ms of database time.
  const { rows } = await pool.query(
    `
SELECT
    a.ssh_keys || COALESCE(p.users->a.account_id::TEXT->'ssh_keys','{}') AS ssh_keys
FROM
    projects p
    JOIN accounts a ON p.users ? a.account_id::TEXT IS NOT NULL
WHERE
    p.project_id = $1
`,
    [project_id],
  );


  for (const { ssh_keys } of rows) {
    for (const fingerprint in ssh_keys) {
      keys[fingerprint] = ssh_keys[fingerprint];
    }
  }
  return keys;
*/
}
