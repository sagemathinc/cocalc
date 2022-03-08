import { getServerSettings } from "@cocalc/server/settings";
import { getProject } from "@cocalc/server/projects/control";
import LRU from "lru-cache";

import getLogger from "@cocalc/backend/logger";
const logger = getLogger("project-connection:handle-version");

const restarted = new LRU<string, true>({
  maxAge: 15 * 1000 * 60, // never try to restart more than once every 15 minutes
});

export default async function handleVersion(
  project_id: string,
  version: number
) : Promise<void> {
  if (restarted.has(project_id)) return;

  // Restart project if version of project code is too old.
  const { version_min_project } = await getServerSettings();
  if (!version_min_project || version_min_project <= version) return;

  restarted.set(project_id, true);
  const project = getProject(project_id);
  try {
    await project.restart();
  } catch (err) {
    logger.debug(
      "WARNING -- error restarting project due to version too old",
      project_id,
      err
    );
  }
}
