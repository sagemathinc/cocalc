/*
cocalc-kubernetes support.

TODO/CRITICAL: I deleted this from target.ts, so be sure to make this.host be actually right!

  if (project._kubernetes) {
    // this is ugly -- need to determine host in case of kubernetes, since
    // host as set in the project object is old/wrong.
    const status = await callback2(project.status);
    if (!status.ip) {
      throw Error("must wait for project to start");
    }
    host = status.ip;
  }



*/

import { BaseProject, ProjectStatus, ProjectState, getProject } from "./base";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("project-control-kubernetes");

class Project extends BaseProject {
  async state(): Promise<ProjectState> {
    logger.debug("state ", this.project_id);
    throw Error("implement me");
  }

  async status(): Promise<ProjectStatus> {
    logger.debug("status ", this.project_id);
    throw Error("implement me");
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
