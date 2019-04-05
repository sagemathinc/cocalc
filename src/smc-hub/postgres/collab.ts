/* Adding (and later removing) collaborators to/from projects. */

import { PostgreSQL } from "./types";

import { is_array, is_valid_uuid_string } from "smc-util/misc2";

import { callback2 } from "smc-util/async-utils";

export async function add_collaborators_to_projects(
  db: PostgreSQL,
  account_id: string,
  accounts: string[],
  projects: string[]
): Promise<void> {
  /* Right now this function is called from outside typescript
    (e.g., api from user), so we have to do extra type checking.
    Also, the input is uuid's, which typescript can't check. */
  verify_types(account_id, accounts, projects);

  await verify_write_access_to_projects(db, account_id, projects);

  // Now we just need to do the actual collab add.  This could be done in many
  // ways that are more parallel, or via a single transaction, etc... but for
  // now let's just do it one at a time.   If any fail, then nothing further
  // will happen and the client gets an error.  This should result in minimal
  // load given that it's one at a time, and the server and db are a ms from
  // each other.
  for (let i in projects) {
    const project_id: string = projects[i];
    const account_id: string = accounts[i];
    await callback2(db.add_user_to_project, { project_id, account_id });
  }
}

async function verify_write_access_to_projects(
  db: PostgreSQL,
  account_id: string,
  projects: string[]
): Promise<void> {
  // Also, we are not doing this in parallel, but could. Let's not
  // put undue load on the server for this.

  // Note that projects are likely to repeated, so we use a Set.
  const groups = ["owner", "collaborator"];
  for (let project_id of new Set(projects)) {
    if (
      !(await callback2(db.user_is_in_project_group, {
        project_id,
        account_id,
        groups
      }))
    ) {
      throw Error(
        `user ${account_id} does not have write access to project ${project_id}`
      );
    }
  }
}

function verify_types(
  account_id: string,
  accounts: string[],
  projects: string[]
) {
  if (!is_valid_uuid_string(account_id))
    throw Error(`account_id (="${account_id}") must be a valid uuid string (type=${typeof account_id})`);
  if (!is_array(accounts)) {
    throw Error("accounts must be an array");
  }
  if (!is_array(projects)) {
    throw Error("projects must be an array");
  }
  if (accounts.length != projects.length) {
    throw Error(
      `accounts (of length ${accounts.length}) and projects (of length ${
        projects.length
      }) must be arrays of the same length`
    );
  }
  for (let x of accounts) {
    if (!is_valid_uuid_string(x))
      throw Error(`all account id's must be valid uuid's, but "${x}" is not`);
  }
  for (let x of projects) {
    if (!is_valid_uuid_string(x))
      throw Error(`all project id's must be valid uuid's, but "${x}" is not`);
  }
}
