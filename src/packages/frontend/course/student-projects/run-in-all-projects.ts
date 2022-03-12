/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  start_project,
  exec,
} from "@cocalc/frontend/frame-editors/generic/client";
import { map as awaitMap } from "awaiting";
import { MAX_PARALLEL_TASKS } from "./actions";

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
  const task = async (project_id) => {
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
    if (log != null) log(result);
    return result;
  };

  return await awaitMap(project_ids, MAX_PARALLEL_TASKS, task);
}
