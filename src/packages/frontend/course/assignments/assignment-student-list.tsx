/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

// CoCalc libraries
import { AppRedux, useMemo, useRedux } from "@cocalc/frontend/app-framework";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { search_match, search_split, trunc_middle } from "@cocalc/util/misc";
import { StudentAssignmentInfo } from "../common";
import type {
  AssignmentRecord,
  CourseStore,
  IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
} from "../store";
import {
  assignment_identifier,
  parse_students,
  pick_student_sorter,
} from "../util";

interface StudentListForAssignmentProps {
  frame_id?: string;
  name: string;
  redux: AppRedux;
  assignment: AssignmentRecord;
  students: any;
  user_map: any;
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
  search: string;
}

export function StudentListForAssignment({
  frame_id,
  name,
  redux,
  assignment,
  students,
  user_map,
  active_feedback_edits,
  nbgrader_run_info,
  search,
}: StudentListForAssignmentProps) {
  const intl = useIntl();

  const active_student_sort: SortDescription = useRedux(
    name,
    "active_student_sort",
  );
  const student_list: string[] = useMemo(() => {
    const v0 = parse_students(students, user_map, redux, intl);
    const store = get_store();

    // Remove deleted students or students not matching the search
    const terms = search_split(search);
    const v1: any[] = [];
    for (const x of v0) {
      if (x.deleted) continue;
      if (
        terms.length > 0 &&
        !search_match(store.get_student_name(x.student_id).toLowerCase(), terms)
      ) {
        continue;
      }
      v1.push(x);
    }

    v1.sort(pick_student_sorter(active_student_sort.toJS()));

    return v1.map((x) => x.student_id);
  }, [
    students,
    user_map,
    active_student_sort,
    active_feedback_edits,
    nbgrader_run_info,
    search,
  ]);

  function get_store(): CourseStore {
    return redux.getStore(name) as any;
  }

  function render_student_info(student_id: string) {
    const store = get_store();
    const student = store.get_student(student_id);
    if (student == null) return; // no such student
    const key = assignment_identifier(
      assignment.get("assignment_id"),
      student_id,
    );
    const edited_feedback = active_feedback_edits.get(key);
    return (
      <StudentAssignmentInfo
        key={student_id}
        title={trunc_middle(store.get_student_name(student_id), 40)}
        name={name}
        student={student}
        assignment={assignment}
        grade={store.get_grade(assignment.get("assignment_id"), student_id)}
        nbgrader_scores={store.get_nbgrader_scores(
          assignment.get("assignment_id"),
          student_id,
        )}
        nbgrader_score_ids={store.get_nbgrader_score_ids(
          assignment.get("assignment_id"),
        )}
        comments={store.get_comments(
          assignment.get("assignment_id"),
          student_id,
        )}
        info={store.student_assignment_info(
          student_id,
          assignment.get("assignment_id"),
        )}
        is_editing={!!edited_feedback}
        nbgrader_run_info={nbgrader_run_info}
      />
    );
  }

  function render_students() {
    return (
      <ScrollableList
        virtualize
        rowCount={student_list.length}
        rowRenderer={({ key }) => render_student_info(key)}
        rowKey={(index) => student_list[index]}
        cacheId={`course-assignment-${assignment.get(
          "assignment_id",
        )}-${name}-${frame_id}`}
      />
    );
  }

  return (
    <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
      {render_students()}
    </div>
  );
}
