import { callback2 } from "smc-util/async-utils";

import { trunc } from "smc-util/misc2";

import { PostgreSQL } from "./types";

export interface Patch {
  time_utc: Date;
  patch_length?: number;
  patch?: string;
  user?: string;
  account_id?: string;
  format?: number;
  snapshot?: string;
}

type User = { account_id: string; user: string };

async function get_users(db: PostgreSQL, where): Promise<User[]> {
  const query = "SELECT project_id, users FROM syncstrings";
  // get the user_id --> account_id map
  const results = await callback2(db._query, { query, where });
  if (results.rows.length != 1) {
    throw Error("no such syncstring");
  }
  const account_ids: string[] = results.rows[0].users;
  const project_id: string = results.rows[0].project_id;
  const project_title: string = trunc(
    (await callback2(db.get_project, {
      columns: ["title"],
      project_id
    })).title,
    80
  );

  // get the names of the users
  const names = await callback2(db.account_ids_to_usernames, { account_ids });
  const users: User[] = [];
  for (let account_id of account_ids) {
    if (account_id == project_id) {
      users.push({ account_id, user: `Project: ${project_title}` });
      continue;
    }
    const name = names[account_id];
    if (name == null) continue;
    const user = trunc(`${name.first_name} ${name.last_name}`, 80);
    users.push({ account_id, user });
  }
  return users;
}

export async function syncdoc_history(
  db: PostgreSQL,
  string_id: string,
  include_patches: boolean = false
): Promise<Patch[]> {
  const where = { "string_id = $::TEXT": string_id };
  const users: User[] = await get_users(db, where);

  const order_by = "time";
  let query: string;
  if (include_patches) {
    query = "SELECT time, user_id, format, patch, snapshot FROM patches";
  } else {
    query =
      "SELECT time, user_id, format, length(patch) as patch_length FROM patches";
  }
  const results = await callback2(db._query, { query, where, order_by });
  const patches: Patch[] = [];
  function format_patch(row): Patch {
    const patch: Patch = { time_utc: row.time, format: row.format };
    const u = users[row.user_id];
    if (u != null) {
      for (let k in u) {
        patch[k] = u[k];
      }
    }
    if (include_patches) {
      patch.patch = row.patch;
      if (row.snapshot != null) {
        patch.snapshot = row.snapshot;
      }
    } else {
      patch.patch_length = row.patch_length;
    }
    return patch;
  }
  for (let row of results.rows) {
    patches.push(format_patch(row));
  }
  return patches;
}
