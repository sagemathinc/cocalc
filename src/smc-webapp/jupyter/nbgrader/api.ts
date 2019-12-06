import { project_api, start_project } from "../../frame-editors/generic/client";

import { create_autograde_ipynb } from "./autograde";

export interface NBGraderAPIOptions {
  // Project will try to evaluate/autograde for this many milliseconds;
  // if time is exceeded, all additional problems fail and what we graded
  // so far is returned.
  timeout_ms: number;
  cell_timeout_ms: number;

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
  output: any; // no clue yet.
}

export async function nbgrader(
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  const autograde_ipynb = create_autograde_ipynb(
    opts.instructor_ipynb,
    opts.student_ipynb
  );
  const graded_ipynb = await jupyter_run_notebook(opts.project_id, {
    path: opts.path,
    ipynb: autograde_ipynb,
    limits: {
      max_total_output: 3000000,
      max_output_per_cell: 500000,
      max_time_per_cell_ms: opts.cell_timeout_ms,
      max_total_time_ms: opts.timeout_ms
    }
  });
  return { output: graded_ipynb };
}

export async function jupyter_strip_notebook(
  project_id: string,
  path: string
): Promise<string> {
  await start_project(project_id);
  const api = await project_api(project_id);
  return await api.jupyter_strip_notebook(path);
}

export interface RunNotebookLimits {
  max_total_output?: number; // any output that pushes the total length beyond this many characters is ignored.
  max_output_per_cell?: number; // any output that pushes a single cell's output beyond this many characters is ignored.
  max_time_per_cell_ms?: number; // if running a cell takes longer than this, we interrupt/kill it.
  max_total_time_ms?: number; // if total time to run all cells exceeds this time, we interrupt/kill.
}

export interface RunNotebookOptions {
  path: string;
  ipynb: string;
  limits?: RunNotebookLimits;
}

export async function jupyter_run_notebook(
  project_id: string,
  opts: RunNotebookOptions
): Promise<string> {
  await start_project(project_id);
  const api = await project_api(project_id);
  return await api.jupyter_run_notebook(opts);
}
