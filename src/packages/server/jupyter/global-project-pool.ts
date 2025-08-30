/*

Create a pool of projects that are used for global evaluations
for the Jupyter server api, i.e., for the landing pages, share
server, etc., but not for code in normal projects.

*/

import { isValidUUID } from "@cocalc/util/misc";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getProjects from "@cocalc/server/projects/get";
import create from "@cocalc/server/projects/create";
import getPool from "@cocalc/database/pool";
import { jsonbSet } from "@cocalc/database/postgres/jsonb-utils";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("jupyter-api:global-project-pool");

const DEFAULT_POOL_SIZE = 3;

const TITLE = "[Jupyter API Server v1]";

export default async function getProject(): Promise<string> {
  const { jupyter_account_id, jupyter_project_pool_size = DEFAULT_POOL_SIZE } =
    await getServerSettings();

  if (!isValidUUID(jupyter_account_id)) {
    throw Error(
      "Jupyter API is not correctly configured (account_id is not a valid uuid) -- contact your site admin",
    );
  }

  if (jupyter_project_pool_size < 1) {
    throw Error("Jupyter API project pool must have size at least 1 -- contact your site admin");
  }

  const projects = (
    await getProjects({
      account_id: jupyter_account_id,
      limit: jupyter_project_pool_size + 100,
    })
  ).filter((x) => (x.title ?? "").includes(TITLE));

  log.debug(
    "there are ",
    projects.length,
    " projects, and we need ",
    jupyter_project_pool_size,
  );

  const numToCreate = jupyter_project_pool_size - projects.length;
  if (numToCreate > 0) {
    log.debug("creating ", numToCreate, " missing projects");
    const pool = getPool();
    for (let i = 0; i < numToCreate; i++) {
      const title = `${TITLE} created ${new Date().toISOString()} - ${i}`;
      log.debug("creating ", title);
      const project_id = await create({
        account_id: jupyter_account_id,
        title,
      });
      // upgrade ram; always running (but leave it NOT member hosted)
      const { set, params } = jsonbSet({
        settings: {
          network: 0,
          member_host: 0,
          cores: 2,
          memory: 10000,
          mintime: 172800,
          cpu_shares: 512,
          disk_quota: 8000,
          always_running: 1,
          memory_request: 2,
          project_id,
        },
      });
      await pool.query(
        `UPDATE projects SET ${set} WHERE project_id=\$${params.length + 1}`,
        params.concat(project_id),
      );
      projects.push({ project_id });
    }
  }

  // choose a project at random and return it:
  const randomIndex = Math.floor(Math.random() * projects.length);
  const randomProject = projects[randomIndex];
  return randomProject.project_id;
}
