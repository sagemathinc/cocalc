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
        const s = get_score(output);
        if (s === undefined) {
          // no information about score yet
          continue;
        }
        if (s === 0) {
          score = 0;
          break; // game over.
        }
        // must be an actual score.
        // avoid cheating by somehow outputting something larger than max number of points
        score = Math.min(s, points);
        // Important: at this point we do NOT break, because a *later* output could
        // easily reduce the score to 0, and we don't want students to easily cheat (?).
        // This potentially diverges from official nbgrader behavior.
      }
      scores[nbgrader.grade_id] = { score, points, manual };
    }
  }
  return scores;
}

// See comment/rant below...
function get_score(output): number | undefined {
  if (output["traceback"] != null) {
    // If there is any traceback at all, it's 0 points.
    return 0;
  }
  if (output["text"] == null) {
    // no impact on score
    return undefined;
  }
  if (output["text"] != null) {
    if (output["text"].toLowerCase().indexOf("error") != -1) {
      // With Octave assertions output text that contains the word "error".
      // Official nbgrader would give this full credit, but with CoCalc we will
      // give it 0 credit.
      // We can't just make *any* output give 0 credit though, e.g., it might be
      // valid to put some print logging in a solution.
      return 0;
    }
    // if output can cast to finite float, use that as the score (partial credit)
    try {
      const x = parseFloat(output["text"]);
      if (isFinite(x)) {
        return x;
      }
    } catch (_) {}
  }

  return undefined;
}

/* Comment/rant:

As of Sept 20, 2020: here's what the official nbgrader docs say about autograder test cells:

> "Test cells should contain assert statements (or similar). When run through
nbgrader autograde (see Autograde assignments), the cell will pass if no
errors are raised, and fail otherwise. You must specify the number of points
that each test cell is worth; then, if the tests pass during autograding,
students will receive the specified number of points, and **otherwise will
receive zero points**." https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#autograder-tests-cells

The official nbgrader source code [here](https://github.com/jupyter/nbgrader/blob/master/nbgrader/utils.py#L97):

```
        # for code cells, we look at the output. There are three options:
        # 1. output contains an error (no credit);
        # 2. output is a value greater than 0 (partial credit);
        # 3. output is something else, or nothing (full credit).
        for output in cell.outputs:
            # option 1: error, return 0
            if output.output_type == 'error' or output.output_type == "stream" and output.name == "stderr":
                return 0, max_points
            # if not error, then check for option 2, partial credit
            if output.output_type == 'execute_result':
                # is there a single result that can be cast to a float?
                partial_grade = get_partial_grade(output, max_points, log)
                return partial_grade, max_points

        # otherwise, assume all fine and return all the points
        return max_points, max_points

...
        warning_msg = """For autograder tests, expecting output to indicate partial
        credit and be single value between 0.0 and max_points. Currently treating other
        output as full credit, but future releases may treat as error.""""
```

As far as I can tell, the octave kernel doesn't create stderr or error
output_types when there is an assertion failure. So it seems like the Octave
kernel is unusable with this.  Octave does this:
```
   "name": "stdout",
   "output_type": "stream",
     "text": [
      "error: No Answer Given!...]
```

So here are CoCalc's rules:

  - same as nbgrader, except if there is "error" in the output
  - then different.

Also, we do NOT stop checking for errors in output even if there is partial credit
output, since that seems like a possible way students can cheat (!?)


*/
