/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

export function nbgrader_status(
  assignment: Map<string, any>
): {
  succeeded: number;
  failed: number;
  not_attempted: number;
  attempted: number;
} {
  const student_ids = assignment.get("last_collect").keySeq().toJS(); // students whose work has been collected
  const scores = assignment.get("nbgrader_scores");
  const result = { succeeded: 0, failed: 0, not_attempted: 0, attempted: 0 };
  if (scores == null) {
    result.not_attempted = student_ids.length;
  } else {
    for (const student_id of student_ids) {
      const state = grading_state(student_id, scores);
      result[state] += 1;
    }
  }
  result.attempted = result.succeeded + result.failed;
  return result;
}

type GradingState = "succeeded" | "failed" | "not_attempted";

export function grading_state(
  student_id: string,
  nbgrader_scores
): GradingState {
  const x = nbgrader_scores?.get(student_id);
  if (x == null) {
    return "not_attempted";
  } else {
    for (const [_, val] of x) {
      if (typeof val == "string") {
        return "failed";
      }
    }
    return "succeeded";
  }
}
