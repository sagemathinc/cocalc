/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import { callback2 } from "@cocalc/util/async-utils";
import { PostgreSQL } from "../types";

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
  account_id_or_email_address: string
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
  account_id_or_email_address: string
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
  age_d = 30
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
