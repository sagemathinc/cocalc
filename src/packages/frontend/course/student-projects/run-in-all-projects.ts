/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
  timeout?: number,
): Promise<any> {
  await start_project(project_id, 60);
  return await exec({ project_id, command, args, timeout, err_on_exit: false });
}

export type Result = {
  project_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  timeout?: number;
  total_time: number;
};

export async function run_in_all_projects(
  project_ids: string[],
  command: string,
  args?: string[],
  timeout?: number,
  log?: Function,
): Promise<Result[]> {
  let start = Date.now();
  const task = async (project_id) => {
    let result: Result;
    try {
      result = {
        ...(await run_in_project(project_id, command, args, timeout)),
        project_id,
        timeout,
        total_time: (Date.now() - start) / 1000,
      };
    } catch (err) {
      result = {
        project_id,
        stdout: "",
        stderr: `${err}`,
        exit_code: -1,
        total_time: (Date.now() - start) / 1000,
        timeout,
      };
    }
    if (log != null) {
      log(result);
    }
    return result;
  };

  return await awaitMap(project_ids, MAX_PARALLEL_TASKS, task);
}
