/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
import {
  AppRedux,
  React,
  Rendered,
  useMemo,
} from "@cocalc/frontend/app-framework";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import {
  is_different,
  search_match,
  search_split,
  trunc_middle,
} from "@cocalc/util/misc";
import { StudentAssignmentInfo, StudentAssignmentInfoHeader } from "../common";
import {
  AssignmentRecord,
  CourseStore,
  IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
} from "../store";
import * as util from "../util";

interface StudentListForAssignmentProps {
  frame_id?: string;
  name: string;
  redux: AppRedux;
  assignment: AssignmentRecord;
  students: any;
  user_map: any;
  background?: string;
  active_student_sort: SortDescription;
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
  search: string;
}

function isSame(prev, next): boolean {
  return !is_different(prev, next, [
    "assignment",
    "students",
    "user_map",
    "background",
    "active_student_sort",
    "active_feedback_edits",
    "nbgrader_run_info",
    "search",
  ]);
}

export const StudentListForAssignment: React.FC<StudentListForAssignmentProps> =
  React.memo((props: StudentListForAssignmentProps) => {
    const {
      frame_id,
      name,
      redux,
      assignment,
      students,
      user_map,
      background,
      active_student_sort,
      active_feedback_edits,
      nbgrader_run_info,
      search,
    } = props;

    const student_list: string[] = useMemo(() => {
      const v0 = util.parse_students(students, user_map, redux);
      const store = get_store();

      // Remove deleted students or students not matching the search
      const terms = search_split(search);
      const v1: any[] = [];
      for (const x of v0) {
        if (x.deleted) continue;
        if (
          terms.length > 0 &&
          !search_match(
            store.get_student_name(x.student_id).toLowerCase(),
            terms
          )
        ) {
          continue;
        }
        v1.push(x);
      }

      v1.sort(util.pick_student_sorter(active_student_sort.toJS()));

      if (active_student_sort.get("is_descending")) {
        v1.reverse();
      }

      return v1.map((x) => x.student_id);
    }, [
      assignment,
      students,
      user_map,
      background,
      active_student_sort,
      active_feedback_edits,
      nbgrader_run_info,
      search,
    ]);

    function get_store(): CourseStore {
      return redux.getStore(name) as any;
    }

    function is_peer_graded(): boolean {
      const peer_info = assignment.get("peer_grade");
      return peer_info ? peer_info.get("enabled") : false;
    }

    function render_student_info(student_id: string): Rendered {
      const store = get_store();
      const student = store.get_student(student_id);
      if (student == null) return; // no such student
      const key = util.assignment_identifier(
        assignment.get("assignment_id"),
        student_id
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
            student_id
          )}
          nbgrader_score_ids={store.get_nbgrader_score_ids(
            assignment.get("assignment_id")
          )}
          comments={store.get_comments(
            assignment.get("assignment_id"),
            student_id
          )}
          info={store.student_assignment_info(
            student_id,
            assignment.get("assignment_id")
          )}
          is_editing={!!edited_feedback}
          nbgrader_run_info={nbgrader_run_info}
        />
      );
    }

    function render_students(): Rendered {
      return (
        <ScrollableList
          rowCount={student_list.length}
          rowRenderer={({ key }) => render_student_info(key)}
          rowKey={(index) => student_list[index]}
          cacheId={`course-assignment-${assignment.get(
            "assignment_id"
          )}-${name}-${frame_id}`}
        />
      );
    }

    return (
      <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
        <StudentAssignmentInfoHeader
          key="header"
          title="Student"
          peer_grade={is_peer_graded()}
        />
        {render_students()}
      </div>
    );
  }, isSame);
