/* Run a shell command (mini terminal) in projects with given id. */

import { start_project, exec } from "../frame-editors/generic/client";

async function run_in_project(
  project_id: string,
  command: string,
  args?: string[],
  timeout?: number
): Promise<any> {
  await start_project(project_id, 60);
  return await exec({project_id, command, args, timeout });
}

export async function run_in_all_projects(
  project_ids: string[],
  command: string,
  args?: string[],
  timeout?: number
): Promise<any[]> {
  const v : any[] = [];
  for (let project_id of project_ids) {
    v.push(await run_in_project(project_id, command, args, timeout));
  }
  return v;
}
