/* Run a shell command (mini terminal) in projects with given id. */

import { start_project, exec } from "../../frame-editors/generic/client";

async function run_in_project(
  project_id: string,
  command: string,
  args?: string[],
  timeout?: number
): Promise<any> {
  await start_project(project_id, 60);
  return await exec({ project_id, command, args, timeout, err_on_exit: false });
}

export type Result = {
  project_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
};

export async function run_in_all_projects(
  project_ids: string[],
  command: string,
  args?: string[],
  timeout?: number,
  log?: Function
): Promise<Result[]> {
  const v: Result[] = [];
  for (const project_id of project_ids) {
    let result: Result;
    try {
      result = await run_in_project(project_id, command, args, timeout);
      result.project_id = project_id;
    } catch (err) {
      result = {
        project_id,
        stdout: "",
        stderr: err.toString(),
        exit_code: -1,
      };
    }
    v.push(result);
    if (log != null) {
      log(result);
    }
  }
  return v;
}
