/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { callback2 } from "@cocalc/util/async-utils";
import { PostgreSQL } from "./types";
import { minutes_ago } from "@cocalc/util/misc";
import { getServerSettings } from "@cocalc/database/settings";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";

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
This deletes all projects older than the given number of days, from the perspective of a user.
Another task has to run to actually get rid of the data, etc.
*/
export async function unlink_old_deleted_projects(
  db: PostgreSQL,
  age_d = 30,
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: [
      "deleted  = true",
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
  AND p.state ->> 'state' != 'deleted'
`;

/*
 This is more thorough than the above. It issues actual delete operations on data of projects marked as deleted.
 When done, it sets the state.state to "deleted".

 The operations involves deleting all syncstrings of that project (and associated with that, patches),
 and only for on-prem setups, it also deletes all the data stored in the project on disk.

 This function is called every couple of hours. Hence ensure it does not run longer than the given max_run_m time (minutes)
*/
export async function cleanup_old_projects_data(
  db: PostgreSQL,
  delay_ms = 50,
  max_run_m = 60,
) {
  const settings = await getServerSettings();
  const on_prem = settings.kucalc === KUCALC_ON_PREMISES;

  log.debug("cleanup_old_projects_data", { delay_ms, max_run_m, on_prem });
  const start_ts = new Date();

  const pool = getPool();
  const { rows } = await pool.query(Q_CLEANUP_SYNCSTRINGS);

  let num = 0;
  let pid = "";

  for (const row of rows) {
    const { project_id, string_id } = row;
    if (start_ts < minutes_ago(max_run_m)) {
      log.debug(
        `cleanup_old_projects_data: too much time elapsed, breaking after ${num} syncstrings`,
      );
      break;
    }

    log.debug(
      `cleanup_old_projects_data: deleting syncstring ${project_id}/${string_id}`,
    );
    num += 1;
    await callback2(db.delete_syncstring, { string_id });

    // wait for the given amount of delay_ms millio seconds
    await new Promise((done) => setTimeout(done, delay_ms));

    if (pid != project_id) {
      pid = project_id;
      if (on_prem) {
        log.debug(
          `cleanup_old_projects_data: deleting project data in ${project_id}`,
        );
        // TODO: this only works on-prem, and requires the project files to be mounted

        log.debug(`deleting all shared files in project ${project_id}`);
        // TODO: do it directly like above, and also get rid of all those shares in the database
      }

      // now, that we're done with that project, mark it as state.state ->> 'deleted'
      await callback2(db.set_project_state, {
        project_id,
        state: "deleted",
      });
    }
  }
}
