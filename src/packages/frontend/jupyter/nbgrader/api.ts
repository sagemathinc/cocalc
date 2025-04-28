/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { project_api } from "../../frame-editors/generic/client";
import { redux } from "../../app-framework";
import { create_autograde_ipynb } from "./autograde";
import type {
  NBGraderAPIOptions,
  NBGraderAPIResponse,
  RunNotebookOptions,
} from "@cocalc/util/jupyter/nbgrader-types";
export type { NBGraderAPIOptions, RunNotebookOptions };

export async function nbgrader(
  opts: NBGraderAPIOptions,
): Promise<NBGraderAPIResponse> {
  // console.log("nbgrader", opts);
  const { autograde_ipynb, ids } = create_autograde_ipynb(
    opts.instructor_ipynb,
    opts.student_ipynb,
  );
  const limits = {
    max_time_per_cell_ms: opts.cell_timeout_ms,
    max_total_time_ms: opts.timeout_ms,
    max_output: opts.max_output,
    max_output_per_cell: opts.max_output_per_cell,
  };
  // console.log("nbgrader -- about to run jupyter_run_notebook", { limits });
  const graded_ipynb = await jupyter_run_notebook(opts.project_id, {
    path: opts.path,
    ipynb: autograde_ipynb,
    nbgrader: true,
    limits,
  });
  // console.log("jupyter_run_notebook returned with ", graded_ipynb);

  return { output: graded_ipynb, ids };
}

export async function jupyter_strip_notebook(
  project_id: string,
  path: string,
): Promise<string> {
  await redux.getActions("projects").start_project(project_id);
  const api = await project_api(project_id);
  return await api.jupyter_strip_notebook(path);
}

export async function jupyter_run_notebook(
  project_id: string,
  opts: RunNotebookOptions,
): Promise<string> {
  // const log = (m) => console.log("jupyter_run_notebook", project_id, m);
  // log("start_project");
  await redux.getActions("projects").start_project(project_id);
  // log("project_api");
  const api = await project_api(project_id);
  // log("jupyter_run_notebook");
  const result = await api.jupyter_run_notebook(opts);
  // log("got " + result);
  return result;
}
