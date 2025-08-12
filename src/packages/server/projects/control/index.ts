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

  // This is used by the database when handling certain writes to make sure
  // that the there is a connection to the corresponding project, so that
  // the project can respond.
  database.ensure_connection_to_project = async (
    _project_id: string,
    cb?: Function,
  ): Promise<void> => {
    console.log("database.ensure_connection_to_project -- DEPRECATED");
    cb?.();
  };

  return getProject;
}
