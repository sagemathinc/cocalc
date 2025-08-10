/*
Compute client for use in Kubernetes cluster by the hub.

This **modifies the database** to get "something out there (manage-actions) to"
start and stop the project, copy files between projects, etc.
*/

import { BaseProject, ProjectStatus, ProjectState, getProject } from "./base";
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";

class Project extends BaseProject {
  constructor(project_id: string) {
    super(project_id);
  }

  private async get(columns: string[]): Promise<{ [field: string]: any }> {
    return await callback2(db().get_project, {
      project_id: this.project_id,
      columns,
    });
  }

  async state(): Promise<ProjectState> {
    return (await this.get(["state"]))?.state ?? {};
  }

  async status(): Promise<ProjectStatus> {
    const status = (await this.get(["status"]))?.status ?? {};
    // In KuCalc the ports for various services are hardcoded constants,
    // and not actually storted in the database, so we put them here.
    // This is also hardcoded in kucalc's addons/project/image/init/init.sh (!)
    status["hub-server.port"] = 6000;
    status["browser-server.port"] = 6001;
    return status;
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
