/*
Implementation of project control for development of CoCalc
from inside of a CoCalc project.
*/

import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  Action,
  getProject,
} from "./base";

class Project extends BaseProject {
  async state(opts: {
    force?: boolean;
    update?: boolean;
  }): Promise<{ error?: string; state?: ProjectState; time?: Date }> {
    console.log("state", opts);
    throw Error("implement me");
  }

  async status(): Promise<ProjectStatus> {
    throw Error("implement me");
  }

  async action(opts: {
    action: Action;
    goal: (state: ProjectState | undefined) => boolean;
    timeout_s?: number;
  }): Promise<void> {
    console.log("action", opts);
    throw Error("implement me");
  }

  async doCopyPath(opts: CopyOptions) {
    console.log("_copy_path", opts);
    throw Error("implement me");
  }

  async directoryListing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
  }): Promise<any> {
    console.log("directory_listing", opts);
    throw Error("implement me");
  }

  async doReadFile(opts: { path: string; maxsize: number }): Promise<Buffer> {
    console.log("_read_file", opts);
    throw Error("implement me");
  }
}

export default async function get(project_id: string): Promise<Project> {
  const P: Project = getProject(project_id) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
