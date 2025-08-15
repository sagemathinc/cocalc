// Do all the account creation actions for the given account.  This should be called
// immediately after creating the account.

import getPool from "@cocalc/database/pool";
import addUserToProject from "@cocalc/server/projects/add-user-to-project";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("server:accounts:creation-actions");

export default async function accountCreationActions({
  email_address,
  account_id,
  tags,
}: {
  email_address?: string;
  account_id: string;
  tags?: string[];
}): Promise<void> {
  log.debug({ account_id, email_address, tags });

  let numProjects = 0;
  if (email_address != null) {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT action FROM account_creation_actions WHERE email_address=$1 AND expire > NOW()",
      [email_address],
    );
    for (const { action } of rows) {
      if (action.action == "add_to_project") {
        const { project_id, group } = action;
        await addUserToProject({ project_id, account_id, group });
        numProjects += 1;
      } else {
        throw Error(`unknown account creation action "${action.action}"`);
      }
    }
  }
  log.debug("added user to", numProjects, "projects");
}

export async function creationActionsDone(account_id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET creation_actions_done=true WHERE account_id=$1::UUID",
    [account_id],
  );
}
