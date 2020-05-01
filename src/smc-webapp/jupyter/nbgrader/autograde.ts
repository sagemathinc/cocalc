/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The function create_autograde_ipynb takes the instructor and student
stripped ipynb file content (as a string), parses it as JSON and
produces the contents of an autograde.ipynb, which is exactly the notebook
that needs to get run linearly somewhere in order to autograde the
student's work.  Once autograde.ipynb is run straight through, the
relevant output can be extracted from autograde.ipynb and inserted
into student_ipynb to give feedback to the student, provide grades,
etc.

The point of this is to ensure that any weird changes (e.g., to the
kernel, test code, etc.) by the student is *ignored* (not just fixed,
but we never even look at it).  Also, all the extra instructor
tests get run.  We do leave in all other code that the student wrote,
because that may be important for defining variables and functions
that get used in testing.
*/

import { copy } from "smc-util/misc";
import { state_to_value } from "./cell-types";

// Enough description of what a Jupyter notebook is for our purposes here.
interface Cell {
  cell_type: "code" | "markdown" | "raw";
  execution_count: number;
  metadata?: {
    collapsed?: boolean;
    nbgrader?: {
      grade: boolean;
      grade_id: string;
      locked: boolean;
      points?: number;
      schema_version: number;
      solution: boolean;
      task: boolean;
    };
  };
  source: string[];
  outputs?: object[];
}

interface NotebookMetadata {
  kernelspec: {
    display_name: string;
    language: string;
    metadata?: object;
    name: string;
  };
  language_info: {
    codemirror_mode?: { name: string; version: number };
    file_extension: string;
    mimetype: string;
    name: string;
    nbconvert_exporter: string;
    pygments_lexer: string;
    version: string;
  };
}

export interface JupyterNotebook {
  metadata: NotebookMetadata;
  nbformat: number;
  nbformat_minor: number;
  cells: Cell[];
}

export function create_autograde_ipynb(
  instructor_ipynb: string,
  student_ipynb: string
): string {
  const instructor = JSON.parse(instructor_ipynb);
  const student = JSON.parse(student_ipynb);
  let instructor_by_grade_id = autograde_cells_by_grade_id(instructor);
  let student_by_grade_id = autograde_cells_by_grade_id(student);
  for (const grade_id in instructor_by_grade_id) {
    const instructor_cell = instructor_by_grade_id[grade_id];
    if (instructor_cell == null) {
      throw Error("bug in cells_by_grade_id data structure");
    }
    const student_cell = student_by_grade_id[grade_id];
    if (student_cell == null) {
      // Something bad happened -- the student deleted this locked cell.  We just insert the instructor
      // version at the bottom for now (?).
      // TODO: be more clever within inserting this...?  What does nbgrader upstream do?
      console.warn(
        "WARNING: student deleted locked cell with grade_id (inserting at end for now)",
        grade_id
      );
      student.cells.push(copy(instructor_cell));
    } else {
      // Student cell exists as it should, so replace content by the instructor version.
      for (const field of ["cell_type", "metadata", "source"]) {
        student_cell[field] = copy(instructor_cell[field]);
      }
    }
  }

  const autograde_ipynb = JSON.stringify(student);
  return autograde_ipynb;
}

// Return a map from grade_id to reference to actual cell in the given notebook.
// This makes it so we can avoid doing a linear search through the cells field,
// to find a cell with given id.
function autograde_cells_by_grade_id(
  notebook: JupyterNotebook
): { [grade_id: string]: Cell } {
  const r: { [grade_id: string]: Cell } = {};
  for (const cell of notebook.cells) {
    if (cell.metadata == null || cell.metadata.nbgrader == null) continue;
    if (cell.metadata.nbgrader.grade && !cell.metadata.nbgrader.solution) {
      // An autograde cell.
      const grade_id = cell.metadata.nbgrader.grade_id;
      if (grade_id) {
        r[grade_id] = cell;
      }
    }
  }
  return r;
}

export interface Score {
  score?: number;
  points: number;
  manual: boolean; // true if this must be manually graded.
}

// Scores or string = error message.
export type NotebookScores = { [grade_id: string]: Score };

export function extract_auto_scores(notebook: JupyterNotebook): NotebookScores {
  const scores: NotebookScores = {};
  for (const cell of notebook.cells) {
    if (cell == null) continue;
    const metadata = cell.metadata;
    if (metadata == null) continue;
    const nbgrader = metadata.nbgrader;
    if (nbgrader == null) continue;
    const points = nbgrader.points;
    if (!points) continue; // no points (or 0 points), so no grading to be done or point in recording one.
    let value: string;
    try {
      value = state_to_value(nbgrader);
    } catch (err) {
      // invalid so ignore
      console.warn("malformed nbgrader metadata", nbgrader);
      continue;
    }
    const manual = value != "test"; // anything except 'test' must be manually graded.
    if (manual) {
      // manual grading
      scores[nbgrader.grade_id] = { points, manual }; // human has to assign score (maybe we could assign 0 if same as generated?)
    } else {
      // automatic grading
      const outputs = cell.outputs ? cell.outputs : [];
      // get a full score of all points unless there are any tracebacks in the output in which
      // case get a score of 0.   I don't know how scoring could be done in any more precise
      // way, given what nbgrader provides.  More precise scoring is likely done with multiple
      // distinct cells...
      let score: number = points;
      for (const output of outputs) {
        if (output["traceback"] != null) {
          score = 0;
          break; // game over.
        }
      }
      scores[nbgrader.grade_id] = { score, points, manual };
    }
  }
  return scores;
}
