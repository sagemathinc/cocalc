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
  let succeeded = 0;
  let failed = 0;
  let not_attempted = 0;
  if (scores == null) {
    not_attempted = student_ids.length;
  } else {
    for (const student_id of student_ids) {
      const x = scores.get(student_id);
      if (x == null) {
        not_attempted += 1;
      } else {
        let did_fail = false;
        for (const [_, val] of x) {
          if (typeof val == "string") {
            failed += 1;
            did_fail = true;
            break;
          }
        }
        if (!did_fail) {
          succeeded += 1;
        }
      }
    }
  }

  return {
    succeeded,
    failed,
    not_attempted,
    attempted: succeeded + failed,
  };
}
