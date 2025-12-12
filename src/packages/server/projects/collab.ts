/*
 *  This file is part of CoCalc: Copyright © 2020 - 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PostgreSQL } from "@cocalc/database/postgres/types";
import { is_array, is_valid_uuid_string } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import isSandbox from "@cocalc/server/projects/is-sandbox";
import idleSandboxUsers from "@cocalc/server/projects/idle-sandbox-users";
import {
  ensureCanManageCollaborators,
  ensureCanRemoveUser,
} from "./ownership-checks";

const GROUPS = ["owner", "collaborator"] as const;

export async function add_collaborators_to_projects(
  db: PostgreSQL,
  account_id: string,
  accounts: string[],
  projects: string[], // can be empty strings if tokens specified (since they determine project_id)
  tokens?: string[], // must be all specified or none
): Promise<void> {
  try {
    // In case of project tokens, this mutates the projects array:
    await verify_write_access_to_projects(db, account_id, projects, tokens);
  } catch (err) {
    // There is one case where a user can add themself to a project that they
    // are not a collaborator on, which is a TA can add themself to a course project.
    // Technically this is the case when accounts[0] == account_id and
    // projects[0] points to a course in project_id where account_id is a
    // collaborator on project_id.    We only support one accounts/projects
    // and no use of tokens for this.
    if (accounts.length == 1 && account_id == accounts[0] && tokens == null) {
      await verify_course_access_to_project(db, account_id, projects[0]);
    } else {
      throw err;
    }
  }

  /* Right now this function is called from outside typescript
    (e.g., api from user), so we have to do extra type checking.
    Also, the input is uuid's, which typescript can't check. */
  verify_types(account_id, accounts, projects);

  // Check strict_collaborator_management setting before database changes
  // Only check if not using tokens (tokens have their own permission system)
  if (!tokens) {
    for (const project_id of new Set(projects)) {
      if (!project_id) continue; // skip empty strings
      await ensureCanManageCollaborators({
        project_id,
        account_id,
      });
    }
  }

  // We now know that account_id is allowed to add users to all of the projects,
  // *OR* at that there are valid tokens to permit adding users.

  // Now we just need to do the actual collab add.  This could be done in many
  // ways that are more parallel, or via a single transaction, etc... but for
  // now let's just do it one at a time.   If any fail, then nothing further
  // will happen and the client gets an error.  This should result in minimal
  // load given that it's one at a time, and the server and db are a ms from
  // each other.
  for (const i in projects) {
    const project_id: string = projects[i];
    const account_id: string = accounts[i];
    const token_id: string | undefined = tokens?.[i];
    if (await callback2(db.user_is_collaborator, { project_id, account_id })) {
      // nothing to do since user is already on the given project -- won't use up token.
      continue;
    }
    await callback2(db.add_user_to_project, {
      project_id,
      account_id,
    });
    if (token_id != null) {
      await increment_project_invite_token_counter(db, token_id);
    }
  }
}

export async function remove_collaborators_from_projects(
  db: PostgreSQL,
  account_id: string,
  accounts: string[],
  projects: string[],
): Promise<void> {
  try {
    // Ensure user is allowed to modify project(s)
    //
    await verify_write_access_to_projects(db, account_id, projects);
  } catch (err) {
    // Users can always remove themselves from a project.
    //
    if (accounts.length == 1 && account_id == accounts[0]) {
      await verify_course_access_to_project(db, account_id, projects[0]);
    } else {
      throw err;
    }
  }

  /* Right now this function is called from outside typescript
    (e.g., api from user), so we have to do extra type checking.
    Also, the input is uuid's, which typescript can't check. */
  verify_types(account_id, accounts, projects);

  // Check strict_collaborator_management setting before database changes
  // Skip check if the user is only removing themselves
  const is_self_remove_only =
    accounts.length === 1 && accounts[0] === account_id;
  if (!is_self_remove_only) {
    for (const project_id of new Set(projects)) {
      if (!project_id) continue; // skip empty strings
      await ensureCanManageCollaborators({
        project_id,
        account_id,
      });
    }
  }

  // CRITICAL: Verify that no target users are owners
  // Owners must be demoted to collaborator first, then removed
  for (const i in projects) {
    const project_id: string = projects[i];
    const target_account_id: string = accounts[i];
    await ensureCanRemoveUser({
      project_id,
      target_account_id,
    });
  }

  // Remove users from projects
  //
  for (const i in projects) {
    const project_id: string = projects[i];
    const account_id: string = accounts[i];

    await callback2(db.remove_user_from_project, {
      project_id,
      account_id,
    });
  }
}

// This is only meant to be used here in support of
// add_collaborators_to_projects -- do not export it.
async function verify_write_access_to_projects(
  db: PostgreSQL,
  account_id: string,
  projects: string[],
  tokens?: string[],
): Promise<void> {
  // Also, we are not doing this in parallel, but could. Let's not
  // put undue load on the server for this.
  if (tokens != null) {
    // Using tokens for adding users to projects...
    for (let i = 0; i < projects.length; i++) {
      if (tokens[i] == null) {
        throw Error("If tokens are specified, they must all be non-null.");
      }
      const { project_id, error } = await project_invite_token_project_id(
        db,
        tokens[i],
      );
      if (error || !project_id) {
        throw Error(`Project invite token is not valid - ${error}`);
      }
      projects[i] = project_id;
    }
    return;
  }
  // Not using tokens:
  // Note that projects are likely to be repeated, so we use a Set.
  for (const project_id of new Set(projects)) {
    if (
      !(await callback2(db.user_is_in_project_group, {
        project_id,
        account_id,
        groups: GROUPS,
      }))
    ) {
      if (await isSandbox(project_id)) {
        // It's a sandbox project, so... (1) we allow adding the collaborator,
        // and (2) we might do maintenance on it.  We do await this since we
        // don't want to add and remove at the exact same time.
        await sandboxMaintenance(db, project_id);
        return;
      }

      throw Error(
        `user ${account_id} does not have write access to project ${project_id}`,
      );
    }
  }
}

function verify_types(
  account_id: string,
  accounts: string[],
  projects: string[],
) {
  if (!is_valid_uuid_string(account_id))
    throw Error(
      `account_id (="${account_id}") must be a valid uuid string (type=${typeof account_id})`,
    );
  if (!is_array(accounts)) {
    throw Error("accounts must be an array");
  }
  if (!is_array(projects)) {
    throw Error("projects must be an array");
  }
  if (accounts.length != projects.length) {
    throw Error(
      `accounts (of length ${accounts.length}) and projects (of length ${projects.length}) must be arrays of the same length`,
    );
  }
  for (const x of accounts) {
    if (!is_valid_uuid_string(x))
      throw Error(`all account id's must be valid uuid's, but "${x}" is not`);
  }
  for (const x of projects) {
    if (x != "" && !is_valid_uuid_string(x))
      throw Error(
        `all project id's must be valid uuid's (or empty), but "${x}" is not`,
      );
  }
}

// Returns {error:"..."} if token is not valid.
// Returns {project_id:"...."} with project_id of the project if the token is valid.
async function project_invite_token_project_id(
  db: PostgreSQL,
  token: string,
): Promise<{ project_id?: string; error?: string }> {
  let v;
  try {
    v = await db.async_query({
      table: "project_invite_tokens",
      select: ["expires", "counter", "usage_limit", "project_id"],
      where: { token },
    });
  } catch (err) {
    return { error: `problem querying the database -- ${err}` };
  }
  if (v.rows.length == 0) return { error: "no such token" };
  const { expires, counter, usage_limit, project_id } = v.rows[0];
  if (expires != null && expires <= new Date()) {
    return { error: "the token already expired" };
  }
  if (usage_limit != null && counter >= usage_limit) {
    return { error: `the token can only be used ${usage_limit} times` };
  }
  return { project_id };
}

async function increment_project_invite_token_counter(
  db: PostgreSQL,
  token: string,
): Promise<void> {
  await db.async_query({
    query:
      "UPDATE project_invite_tokens SET counter=coalesce(counter, 0)+1 WHERE token=$1",
    params: [token],
  });
}

async function verify_course_access_to_project(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
): Promise<void> {
  /*
  Raise an exception unless:

     - project_id is associated to a course in another project course_id
     - account_id is a collaborator on course_id.
   */
  // Get the course field of project_id
  const v = await db.async_query({
    query: "SELECT course FROM projects WHERE project_id=$1",
    params: [project_id],
  });
  if (v.rows.length == 0) {
    throw Error(`no project with id "${project_id}"`);
  }
  const course_id = v.rows[0].course?.project_id;
  if (!is_valid_uuid_string(course_id)) {
    throw Error(`cannot add self to "${project_id}" -- must be an admin`);
  }
  if (!is_valid_uuid_string(account_id)) {
    // be extra careful since we directly put account_id in the query string.
    throw Error(`account_id ${account_id} must be a valid uuid`);
  }
  const w = await db.async_query({
    query: `SELECT users#>'{${account_id},group}' AS group FROM projects WHERE project_id=\$1`,
    params: [course_id],
  });
  const group = w.rows[0]?.group;
  if (group != "owner" && group != "collaborator") {
    throw Error(
      `cannot add self to "${project_id}" -- must be owner or collaborator on course project`,
    );
  }
}

/*
Maintain a sandbox project.  Right now the only thing this does
is remove idle users, since if we don't do that, then within a day
there could easily be 5000 users on one project, and our implementation
of changefeeds, etc., doesn't scale well to that size, and also the UI
gets overwhelmed.  This is better.
*/
async function sandboxMaintenance(
  db: PostgreSQL,
  project_id: string,
): Promise<void> {
  const idleUsers = await idleSandboxUsers(project_id);
  // remove them
  // TODO: obviously we could easily rewrite remove_user_from_project
  // here and make it take a list so as to do all removes in a single
  // call.  Can wait, since this is still trivial effort.
  for (const account_id of idleUsers) {
    await callback2(db.remove_user_from_project, {
      project_id,
      account_id,
    });
  }
}
