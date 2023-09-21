/*
maintainNewProjectPool

This ensures that all projects in the pool are touched periodically,
i.e., running and not about to idle timeout.

The definition of "in the pool" is that the project is (1) not deleted, (2) has a null "users" field,
and (3) last_edited is recent to avoid stale old projects with an old image, etc.
This is a quick query due to indexes.

This also creates new projects to ensure there are enough in the pool.

NOTE: Race condition -- if multiple hubs simultaneously create projects, this at once it would at worst
result in the pool being temporarily too big.
*/

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getAllProjects, createProjects } from "./all-projects";
import { getProject } from "@cocalc/server/projects/control";

const log = getLogger("server:new-project-pool:maintain");

const MAX_CREATE = 50; // never add more than this many projects at once to the pool.

export default function loop(periodMs = 30000) {
  setInterval(async () => {
    try {
      await maintainNewProjectPool();
    } catch (err) {
      log.warn("error in new project pool maintenance", err);
    }
  }, periodMs);
}

let lastCall = Date.now();
export async function maintainNewProjectPool(maxCreate?: number) {
  const now = Date.now();
  if (now - lastCall <= 3000) {
    log.debug("skipping too frequent call to maintainNewProjectPool");
    // no matter what, never do maintenance more than once every few seconds.
    return;
  }
  lastCall = now;
  const { new_project_pool } = await getServerSettings();
  if (!new_project_pool) {
    log.debug("new project pool not enabled");
    return;
  }
  const projects = await getAllProjects();
  const cur = projects.length;
  // Add projects to the pool if necessary
  for (const project_id of await createProjects(
    Math.min(new_project_pool - cur, maxCreate ?? MAX_CREATE)
  )) {
    log.debug("adding ", project_id, "to the pool");
    projects.push(project_id);
  }

  // ensure all projects are running and ready to use
  log.debug(
    "there are currently ",
    projects.length,
    "projects in the pool -- ensuring all are running"
  );
  await Promise.allSettled(
    projects.map(async (project_id) => {
      try {
        await getProject(project_id).touch();
        log.debug("touched ", project_id, "so it stays running");
        return true;
      } catch (error) {
        log.warn(
          "Something went wrong while touching the project with id:",
          project_id,
          ". The error message is:",
          error.message
        );
        return false;
      }
    })
  );
}
