/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { minutes_ago } from "@cocalc/util/misc";
import { bulk_delete } from "./bulk-delete";
import { PostgreSQL } from "./types";

const log = getLogger("db:delete-projects");

/*
Permanently delete from the database all project records, where the
project is explicitly deleted already (so the deleted field is true).
Call this function to setup projects for permanent deletion.  This blanks
the user field so the user no longer can access the project, and we don't
know that the user had anything to do with the project.  A separate phase
later then purges these projects from disk as well as the database.
*/
export async function permanently_unlink_all_deleted_projects_of_user(
  db: PostgreSQL,
  account_id_or_email_address: string,
): Promise<void> {
  // Get the account_id if necessary.
  const account_id = await get_account_id(db, account_id_or_email_address);

  // Get all of the projects for that user that are marked deleted and
  // permanently "unlink" them, i.e., set them up for permanent delete.
  await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: ["deleted  = true", `users#>'{${account_id}}' IS NOT NULL`],
  });
}

async function get_account_id(
  db: PostgreSQL,
  account_id_or_email_address: string,
): Promise<string> {
  if (account_id_or_email_address.indexOf("@") == -1) {
    return account_id_or_email_address;
  }

  // It is an email address
  return (
    await callback2(db.get_account, {
      email_address: account_id_or_email_address,
      columns: ["account_id"],
    })
  ).account_id;
}

/*
This removes all users from all projects older than the given number of days and marked as deleted.
In particular, users are no longer able to access that project.
The "cleanup_old_projects_data" function has to run to actually get rid of the data, etc.
*/
export async function unlink_old_deleted_projects(
  db: PostgreSQL,
  age_d = 30,
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: [
      "deleted = true",
      "users IS NOT NULL",
      `last_edited <= NOW() - '${age_d} days'::INTERVAL`,
    ],
  });
}

const Q_CLEANUP_SYNCSTRINGS = `
SELECT p.project_id, s.string_id
FROM projects as p
  INNER JOIN syncstrings as s
  ON p.project_id = s.project_id
WHERE p.deleted = true
  AND users IS NULL
  AND p.state ->> 'state' != 'deleted'
ORDER BY
  p.project_id, s.string_id
`;

/*
 This more thorough delete procedure comes after the above.
 It issues actual delete operations on data of projects marked as deleted.
 When done, it sets the state.state to "deleted".

 The operations involves deleting all syncstrings of that project (and associated with that, patches),
 and only for on-prem setups, it also deletes all the data stored in the project on disk and various tables.

 This function is called every couple of hours. Hence it checks to not run longer than the given max_run_m time (minutes).
*/
export async function cleanup_old_projects_data(
  db: PostgreSQL,
  max_run_m = 60,
) {
  const settings = await getServerSettings();
  const on_prem = settings.kucalc === KUCALC_ON_PREMISES;
  const L0 = log.extend("cleanup_old_projects_data");
  const L = L0.debug;

  log.debug("cleanup_old_projects_data", { max_run_m, on_prem });
  const start_ts = new Date();

  const pool = getPool();
  const { rows } = await pool.query(Q_CLEANUP_SYNCSTRINGS);

  let num = 0;
  let pid = "";

  for (const row of rows) {
    const { project_id, string_id } = row;
    if (start_ts < minutes_ago(max_run_m)) {
      L(`too much time elapsed, breaking after ${num} syncstrings`);
      break;
    }

    L(`deleting syncstring ${project_id}/${string_id}`);
    num += 1;
    await callback2(db.delete_syncstring, { string_id });

    // wait a bit after deleting syncstrings, e.g. to let the standby db catch up
    await new Promise((done) => setTimeout(done, 100));

    // Q_CLEANUP_SYNCSTRINGS orders by project_id, hence we trigger project specific actions when the id changes
    if (pid != project_id) {
      pid = project_id;
      const L2 = L0.extend(project_id).debug;

      if (on_prem) {
        L2(`cleanup_old_projects_data for project_id=${project_id}`);
        // TODO: this only works on-prem, and requires the project files to be mounted

        L2(`deleting all shared files in project ${project_id}`);
        // TODO: do it directly like above, and also get rid of all those shares in the database

        const delPublicPaths = await bulk_delete({
          table: "public_paths",
          field: "project_id",
          value: project_id,
        });
        L2(`deleted public_paths ${delPublicPaths.rowsDeleted} entries`);

        const delProjectLog = await bulk_delete({
          table: "project_log",
          field: "project_id",
          value: project_id,
        });
        L2(`deleted project_log ${delProjectLog.rowsDeleted} entries`);

        const delFileUse = await bulk_delete({
          table: "file_use",
          field: "project_id",
          value: project_id,
        });
        L2(`deleted file_use ${delFileUse.rowsDeleted} entries`);

        const delAccessLog = await bulk_delete({
          table: "file_access_log",
          field: "project_id",
          value: project_id,
        });
        L2(`deleted file_access_log ${delAccessLog.rowsDeleted} entries`);

        const delJupyterApiLog = await bulk_delete({
          table: "jupyter_api_log",
          field: "project_id",
          value: project_id,
        });
        L2(`deleted jupyter_api_log ${delJupyterApiLog.rowsDeleted} entries`);

        for (const field of [
          "target_project_id",
          "source_project_id",
        ] as const) {
          const delCopyPaths = await bulk_delete({
            table: "copy_paths",
            field,
            value: project_id,
          });
          L2(`deleted copy_paths/${field} ${delCopyPaths.rowsDeleted} entries`);
        }

        const delListings = await bulk_delete({
          table: "listings",
          field: "project_id",
          id: "project_id", // TODO listings has a more complex ID, is this a problem?
          value: project_id,
        });
        L2(`deleted ${delListings.rowsDeleted} listings`);

        const delInviteTokens = await bulk_delete({
          table: "project_invite_tokens",
          field: "project_id",
          value: project_id,
          id: "token",
        });
        L2(`deleted ${delInviteTokens.rowsDeleted} entries`);
      }

      // now, that we're done with that project, mark it as state.state ->> 'deleted'
      // in addition to the flag "deleted = true"
      await callback2(db.set_project_state, {
        project_id,
        state: "deleted",
      });
    }
  }
}
