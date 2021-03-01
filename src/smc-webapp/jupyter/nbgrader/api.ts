/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { project_api } from "../../frame-editors/generic/client";
import { redux } from "../../app-framework";

import { create_autograde_ipynb } from "./autograde";

export interface NBGraderAPIOptions {
  // Project will try to evaluate/autograde for this many milliseconds;
  // if time is exceeded, all additional problems fail and what we graded
  // so far is returned.
  timeout_ms: number;
  cell_timeout_ms: number;
  max_output?: number;
  max_output_per_cell?: number;

  // The *contents* of the student-submitted ipynb file, but with
  // all output deleted (to keep it small).  This is NOT a filename
  // but actual ipynb contents!
  student_ipynb: string;

  // The contents of the instructor version of the ipynb file, but
  // also with any output deleted.   This contains a record of *what*
  // questions were asked and also additional more extensive checks of
  // student solutions.  Again, this is NOT a file name, but ipynb contents!
  instructor_ipynb: string;

  // Directory in which to run grading (e.g., so accessing
  // a data file or auxiliary scripts might work).
  path: string;

  // Project in which to run grading.
  project_id: string;
}

export interface NBGraderAPIResponse {
  output: any; // TODO
  ids: string[]; // the ordered id's of the test cells; order is the order in which they occur in the notebook.
}

export async function nbgrader(
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  // console.log("nbgrader", opts);
  const { autograde_ipynb, ids } = create_autograde_ipynb(
    opts.instructor_ipynb,
    opts.student_ipynb
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
  path: string
): Promise<string> {
  await redux.getActions("projects").start_project(project_id);
  const api = await project_api(project_id);
  return await api.jupyter_strip_notebook(path);
}

export interface RunNotebookLimits {
  max_output?: number; // any output that pushes the total length beyond this many characters is ignored.
  max_output_per_cell?: number; // any output that pushes a single cell's output beyond this many characters is ignored.
  max_time_per_cell_ms?: number; // if running a cell takes longer than this, we interrupt/kill it.
  max_total_time_ms?: number; // if total time to run all cells exceeds this time, we interrupt/kill.
}

export interface RunNotebookOptions {
  path: string;
  ipynb: string;
  nbgrader?: boolean; // if true, only record outputs for nbgrader autograder cells (all cells are run, but only these get output)
  limits?: RunNotebookLimits;
}

export async function jupyter_run_notebook(
  project_id: string,
  opts: RunNotebookOptions
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
