import getLogger from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import { BaseProject, getProject } from "./base";
export { getProject };

export type ProjectControlFunction = (project_id: string) => BaseProject;

export default function init(): ProjectControlFunction {
  const logger = getLogger("project-control");
  logger.debug("init");
  const database = db();
  database.projectControl = getProject;
  return getProject;
}
