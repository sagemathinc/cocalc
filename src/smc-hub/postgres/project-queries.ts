/* Adding (and later removing) collaborators to/from projects. */

import { PostgreSQL } from "./types";

import { callback2 } from "../smc-util/async-utils";

export async function project_has_network_access(
  db: PostgreSQL,
  project_id: string
): Promise<boolean> {
  let x;
  try {
    x = await callback2(db.get_project, {
      project_id,
      columns: ["users", "settings"]
    });
  } catch (err) {
    // error probably means there is no such project or project_id is badly formatted.
    return false;
  }
  if (x.settings != null && x.settings.network) {
    return true;
  }
  if (x.users != null) {
    for (let account_id in x.users) {
      if (
        x.users[account_id] != null &&
        x.users[account_id].upgrades != null &&
        x.users[account_id].upgrades.network
      ) {
        return true;
      }
    }
  }
  return false;
}
