// Do all the account creation actions for the given account.  This should be called
// immediately after creating the account.

import getPool from "@cocalc/database/pool";
import addUserToProject from "@cocalc/server/projects/add-user-to-project";
import firstProject from "./first-project";
import { getLogger } from "@cocalc/backend/logger";
import getOneProject from "@cocalc/server/projects/get-one";
import { getProject } from "@cocalc/server/projects/control";

const log = getLogger("server:accounts:creation-actions");

export default async function accountCreationActions(
  email_address: string,
  account_id: string,
  tags?: string[],
): Promise<void> {
  log.debug({ account_id, email_address, tags });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT action FROM account_creation_actions WHERE email_address=$1 AND expire > NOW()",
    [email_address],
  );
  let numProjects = 0;
  for (const { action } of rows) {
    if (action.action == "add_to_project") {
      const { project_id, group } = action;
      await addUserToProject({ project_id, account_id, group });
      numProjects += 1;
    } else {
      throw Error(`unknown account creation action "${action.action}"`);
    }
  }
  log.debug("added user to", numProjects, "projects");
  if (numProjects == 0) {
    // didn't get added to any projects
    // You're a new user with no known "reason"
    // to use CoCalc, except that you found the page and signed up.  You are
    // VERY likely to create a project next, or you wouldn't be here.
    // So we create a project for you now to increase your chance of success.
    // NOTE -- wrapped in closure, since do NOT block on this:
    (async () => {
      try {
        await firstProject({ account_id, tags });
      } catch (err) {
        // non-fatal; they can make their own project
        log.error("problem configuring first project", account_id, err);
      }
    })();
  } else if (numProjects > 0) {
    // Make sure project is running so they have a good first experience.
    (async () => {
      try {
        const { project_id } = await getOneProject(account_id);
        const project = getProject(project_id);
        await project.start();
      } catch (err) {
        log.error("failed to start newest project invited to", err, account_id);
      }
    })();
  }
}

export async function creationActionsDone(account_id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET creation_actions_done=true WHERE account_id=$1::UUID",
    [account_id],
  );
}
