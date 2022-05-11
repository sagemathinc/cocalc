/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  AppRedux,
  React,
  Rendered,
  useActions,
  useMemo,
  useRedux,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Space, Tip } from "@cocalc/frontend/components";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { cmp_array } from "@cocalc/util/misc";
import { Alert, Col, Row } from "antd";
import { Map, Set } from "immutable";
import { CourseActions } from "../actions";
import { FoldersToolbar } from "../common";
import {
  AssignmentRecord,
  IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
  StudentRecord,
} from "../store";
import * as styles from "../styles";
import * as util from "../util";
import { Assignment } from "./assignment";

interface Props {
  frame_id?: string;
  name: string;
  project_id: string;
  redux: AppRedux;
  actions: CourseActions;
  assignments: Map<string, AssignmentRecord>;
  students: Map<string, StudentRecord>;
  user_map: object;
}

export const AssignmentsPanel: React.FC<Props> = React.memo((props: Props) => {
  const { frame_id, name, project_id, redux, assignments, students, user_map } =
    props;

  const course_actions = useActions<CourseActions>({ name });

  const expanded_assignments: Set<string> = useRedux(
    name,
    "expanded_assignments"
  );
  const active_assignment_sort: SortDescription = useRedux(
    name,
    "active_assignment_sort"
  );
  const active_student_sort: SortDescription = useRedux(
    name,
    "active_student_sort"
  );
  const expanded_peer_configs: Set<string> = useRedux(
    name,
    "expanded_peer_configs"
  );
  const active_feedback_edits: IsGradingMap = useRedux(
    name,
    "active_feedback_edits"
  );
  const nbgrader_run_info: NBgraderRunInfo | undefined = useRedux(
    name,
    "nbgrader_run_info"
  );

  // search query to restrict which assignments are shown.
  const [search, set_search] = useState<string>("");
  // whether or not to show deleted assignments on the bottom
  const [show_deleted, set_show_deleted] = useState<boolean>(false);

  function get_assignment(id: string): AssignmentRecord {
    const assignment = assignments.get(id);
    if (assignment == undefined) {
      console.warn(`Tried to access undefined assignment ${id}`);
    }
    return assignment as any;
  }

  const { shown_assignments, deleted_assignments, num_omitted, num_deleted } =
    useMemo((): {
      shown_assignments: any[];
      deleted_assignments: any[];
      num_omitted: number;
      num_deleted: number;
    } => {
      let deleted, f, num_deleted, num_omitted;
      let list = util.immutable_to_list(assignments, "assignment_id");

      ({ list, num_omitted } = util.compute_match_list({
        list,
        search_key: "path",
        search: search.trim(),
      }));

      if (active_assignment_sort.get("column_name") === "due_date") {
        f = (a) => [
          a.due_date != null ? a.due_date : 0,
          a.path != null ? a.path.toLowerCase() : undefined,
        ];
      } else if (active_assignment_sort.get("column_name") === "dir_name") {
        f = (a) => [
          a.path != null ? a.path.toLowerCase() : undefined,
          a.due_date != null ? a.due_date : 0,
        ];
      }

      ({ list, deleted, num_deleted } = util.order_list({
        list,
        compare_function: (a, b) => cmp_array(f(a), f(b)),
        reverse: active_assignment_sort.get("is_descending"),
        include_deleted: show_deleted,
      }));

      return {
        shown_assignments: list,
        deleted_assignments: deleted,
        num_omitted,
        num_deleted,
      };
    }, [assignments, active_assignment_sort, show_deleted, search]);

  function render_sort_link(
    column_name: string,
    display_name: string
  ): Rendered {
    return (
      <a
        href=""
        onClick={(e) => {
          e.preventDefault();
          return course_actions.assignments.set_active_assignment_sort(
            column_name
          );
        }}
      >
        {display_name}
        <Space />
        {active_assignment_sort.get("column_name") === column_name ? (
          <Icon
            style={{ marginRight: "10px" }}
            name={
              active_assignment_sort.get("is_descending")
                ? "caret-up"
                : "caret-down"
            }
          />
        ) : undefined}
      </a>
    );
  }

  function render_assignment_table_header(): Rendered {
    return (
      <div style={{ borderBottom: "1px solid #e5e5e5" }}>
        <Row style={{ marginRight: "0px" }}>
          <Col md={12}>{render_sort_link("dir_name", "Assignment Name")}</Col>
          <Col md={12}>{render_sort_link("due_date", "Due Date")}</Col>
        </Row>
      </div>
    );
  }

  function render_assignment(assignment_id: string, index: number): Rendered {
    return (
      <Assignment
        key={assignment_id}
        project_id={project_id}
        frame_id={frame_id}
        name={name}
        redux={redux}
        assignment={get_assignment(assignment_id)}
        background={index % 2 === 0 ? "#eee" : undefined}
        students={students}
        user_map={user_map}
        is_expanded={expanded_assignments.has(assignment_id)}
        active_student_sort={active_student_sort}
        expand_peer_config={expanded_peer_configs.has(assignment_id)}
        active_feedback_edits={active_feedback_edits}
        nbgrader_run_info={nbgrader_run_info}
      />
    );
  }

  function render_assignments(
    assignments: { assignment_id: string }[]
  ): Rendered {
    if (assignments.length == 0) {
      return render_no_assignments();
    }
    return (
      <ScrollableList
        rowCount={assignments.length}
        rowRenderer={({ key, index }) => render_assignment(key, index)}
        rowKey={(index) => assignments[index]?.assignment_id ?? ""}
        cacheId={`course-assignments-${name}-${frame_id}`}
      />
    );
  }

  function render_no_assignments(): Rendered {
    const message = (
      <div>
        <h3>Add an Assignment to your Course</h3>
        <p>
          An assignment is a <i>directory</i> of files somewhere in your CoCalc
          project. You copy the assignment to your students and they work on it;
          later, you collect it, grade it, and return the graded version to
          them.
        </p>

        <p>
          Add an assignment to your course by creating a directory using the
          Files tab, then type the name of the directory in the box in the upper
          right and click to search.
        </p>
      </div>
    );

    return (
      <Alert
        type="info"
        style={{ margin: "auto", fontSize: "12pt", maxWidth: "800px" }}
        message={message}
      />
    );
  }

  function render_show_deleted(
    num_deleted: number,
    num_shown: number
  ): Rendered {
    if (show_deleted) {
      return (
        <Button
          style={styles.show_hide_deleted({ needs_margin: num_shown > 0 })}
          onClick={() => set_show_deleted(false)}
        >
          <Tip
            placement="left"
            title="Hide deleted"
            tip="Assignments are never really deleted.  Click this button so that deleted assignments aren't included at the bottom of the list.  Deleted assignments are always hidden from the list of grades for a student."
          >
            Hide {num_deleted} deleted assignments
          </Tip>
        </Button>
      );
    } else {
      return (
        <Button
          style={styles.show_hide_deleted({ needs_margin: num_shown > 0 })}
          onClick={() => {
            set_show_deleted(true);
            set_search("");
          }}
        >
          <Tip
            placement="left"
            title="Show deleted"
            tip="Assignments are not deleted forever even after you delete them.  Click this button to show any deleted assignments at the bottom of the list of assignments.  You can then click on the assignment and click undelete to bring the assignment back."
          >
            Show {num_deleted} deleted assignments
          </Tip>
        </Button>
      );
    }
  }

  function yield_adder(deleted_assignments): (string) => void {
    const deleted_paths = {};
    deleted_assignments.map((obj) => {
      if (obj.path) {
        deleted_paths[obj.path] = obj.assignment_id;
      }
    });

    return (path) => {
      if (deleted_paths[path] != null) {
        course_actions.assignments.undelete_assignment(deleted_paths[path]);
      } else {
        course_actions.assignments.add_assignment(path);
      }
    };
  }

  function header() {
    const add_assignment = yield_adder(deleted_assignments);
    return (
      <div style={{ marginBottom: "15px" }}>
        <FoldersToolbar
          search={search}
          search_change={(value) => set_search(value)}
          num_omitted={num_omitted}
          project_id={project_id}
          items={assignments}
          add_folders={(paths) => paths.map(add_assignment)}
          item_name={"assignment"}
          plural_item_name={"assignments"}
        />
      </div>
    );
  }

  return (
    <div className={"smc-vfill"} style={{ margin: "0" }}>
      {header()}
      {shown_assignments.length > 0
        ? render_assignment_table_header()
        : undefined}
      <div className="smc-vfill">
        {render_assignments(shown_assignments)}{" "}
        {num_deleted
          ? render_show_deleted(num_deleted, shown_assignments.length)
          : undefined}
      </div>
    </div>
  );
});
