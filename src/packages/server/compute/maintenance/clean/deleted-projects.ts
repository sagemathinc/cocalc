/*
Periodically check for compute servers in deleted projects and deprovision them.

RULE: If a project has been deleted, first we automatically turn off any compute servers
in that project, then after a few days, we deprovision them.

We define when a project was deleted to just be the last_edited timestamp, whatever
that might be.

NOTE: There may be various UI stuff to discourage deleting a project before deprovisioning
all compute servers.  However, this is meant to handle any situation, possibly involving
UI failure, the API, batch operations, etc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { deprovision, stop } from "@cocalc/server/compute/control";

const DEPROVISON_CUTOFF_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const logger = getLogger("server:compute:maintenance:clean:deleted-projects");

export async function deletedProjects() {
  const query =
    "SELECT compute_servers.id AS id, compute_servers.account_id AS account_id, projects.last_edited AS last_edited, compute_servers.state AS state FROM compute_servers,projects WHERE compute_servers.project_id=projects.project_id AND projects.deleted AND compute_servers.state is not null AND compute_servers.state!='deprovisioned'";
  const db = getPool();
  const { rows } = await db.query(query);
  logger.debug(`got ${rows.length} non-deprovisioned servers in deleted projects`);
  for (const { id, account_id, last_edited, state } of rows) {
    logger.debug("considering compute server:", {
      id,
      account_id,
      last_edited,
    });
    const now = Date.now();
    const t = last_edited ? new Date(last_edited).valueOf() : 0;
    if (now - t >= DEPROVISON_CUTOFF_MS) {
      logger.debug(
        `it has been a while, so deprovisioning the compute server`,
        { id },
      );
      try {
        await deprovision({ id, account_id });
      } catch (err) {
        logger.debug(`WARNING -- failed to deprovision -- '${err}'`, err);
      }
    } else {
      if (state == "running") {
        // turn it off
        logger.debug(
          "project is deleted so turning off compute server -- will delete later",
          {
            id,
          },
        );
        try {
          await stop({ id, account_id });
        } catch (err) {
          logger.debug(`WARNING -- failed to stop server -- '${err}'`, err);
        }
      }
    }
  }
}

export const deletedTask = {
  f: deletedProjects,
  desc: "stop and later deprovision any compute servers associated to deleted projects",
};
