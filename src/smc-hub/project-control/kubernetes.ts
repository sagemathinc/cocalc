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
