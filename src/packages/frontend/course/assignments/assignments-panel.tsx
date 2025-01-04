/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Col, Row } from "antd";
import { Map, Set } from "immutable";
import { FormattedMessage, useIntl } from "react-intl";
import {
  AppRedux,
  useActions,
  useMemo,
  useRedux,
  useState,
} from "@cocalc/frontend/app-framework";
import { Gap, Icon, Tip } from "@cocalc/frontend/components";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { course } from "@cocalc/frontend/i18n";
import { cmp_array } from "@cocalc/util/misc";

import { CourseActions } from "../actions";
import { AddItems, FoldersToolbar } from "../common/folders-tool-bar";
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
  frameActions;
}

export function AssignmentsPanel(props: Props) {
  const {
    frame_id,
    name,
    project_id,
    redux,
    assignments,
    students,
    user_map,
    frameActions,
  } = props;

  const intl = useIntl();

  const course_actions = useActions<CourseActions>({ name });

  const expanded_assignments: Set<string> = useRedux(
    name,
    "expanded_assignments",
  );
  const active_assignment_sort: SortDescription = useRedux(
    name,
    "active_assignment_sort",
  );
  const expanded_peer_configs: Set<string> = useRedux(
    name,
    "expanded_peer_configs",
  );
  const active_feedback_edits: IsGradingMap = useRedux(
    name,
    "active_feedback_edits",
  );
  const nbgrader_run_info: NBgraderRunInfo | undefined = useRedux(
    name,
    "nbgrader_run_info",
  );

  // search query to restrict which assignments are shown.
  const pageFilter = useRedux(name, "pageFilter");
  const filter = pageFilter?.get("assignments") ?? "";
  const setFilter = (filter: string) => {
    course_actions.setPageFilter("assignments", filter);
  };

  // whether or not to show deleted assignments on the bottom
  const [show_deleted, set_show_deleted] = useState<boolean>(false);

  function get_assignment(id: string): AssignmentRecord {
    const assignment = assignments.get(id);
    if (assignment == undefined) {
      console.warn(`Tried to access undefined assignment ${id}`);
    }
    return assignment as any;
  }

  const { shown_assignments, num_omitted, num_deleted } = useMemo((): {
    shown_assignments: any[];
    num_omitted: number;
    num_deleted: number;
  } => {
    let f, num_deleted, num_omitted;
    let list = util.immutable_to_list(assignments, "assignment_id");

    ({ list, num_omitted } = util.compute_match_list({
      list,
      search_key: "path",
      search: filter.trim(),
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

    ({ list, num_deleted } = util.order_list({
      list,
      compare_function: (a, b) => cmp_array(f(a), f(b)),
      reverse: active_assignment_sort.get("is_descending"),
      include_deleted: show_deleted,
    }));

    return {
      shown_assignments: list,
      num_omitted,
      num_deleted,
    };
  }, [assignments, active_assignment_sort, show_deleted, filter]);

  function render_sort_link(column_name: string, display_name: string) {
    return (
      <a
        href=""
        onClick={(e) => {
          e.preventDefault();
          return course_actions.assignments.set_active_assignment_sort(
            column_name,
          );
        }}
      >
        {display_name}
        <Gap />
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

  function render_assignment_table_header() {
    return (
      <div style={{ borderBottom: "1px solid #e5e5e5" }}>
        <Row style={{ marginRight: "0px" }}>
          <Col md={12}>
            {render_sort_link(
              "dir_name",
              intl.formatMessage({
                id: "course.assignments-panel.table-header.assignments",
                defaultMessage: "Assignment Name",
              }),
            )}
          </Col>
          <Col md={12}>
            {render_sort_link("due_date", intl.formatMessage(course.due_date))}
          </Col>
        </Row>
      </div>
    );
  }

  function render_assignment(assignment_id: string, index: number) {
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
        expand_peer_config={expanded_peer_configs.has(assignment_id)}
        active_feedback_edits={active_feedback_edits}
        nbgrader_run_info={nbgrader_run_info}
      />
    );
  }

  function render_assignments(assignments: { assignment_id: string }[]) {
    if (assignments.length == 0) {
      return render_no_assignments();
    }
    return (
      <ScrollableList
        virtualize
        rowCount={assignments.length}
        rowRenderer={({ key, index }) => render_assignment(key, index)}
        rowKey={(index) => assignments[index]?.assignment_id ?? ""}
        cacheId={`course-assignments-${name}-${frame_id}`}
      />
    );
  }

  function render_no_assignments() {
    return (
      <div>
        <Alert
          type="info"
          style={{
            margin: "15px auto",
            fontSize: "12pt",
            maxWidth: "800px",
          }}
          message={
            <b>
              <a onClick={() => frameActions.setModal("add-assignments")}>
                <FormattedMessage
                  id="course.assignments-panel.no_assignments.message"
                  defaultMessage={"Add Assignments to your Course"}
                  description={"online course for students"}
                />
              </a>
            </b>
          }
          description={
            <div>
              <FormattedMessage
                id="course.assignments-panel.no_assignments.description"
                defaultMessage={`
                  <p>
                    An assignment is a <i>directory</i> of files somewhere in your
                    CoCalc project. You copy the assignment to your students and
                    they work on it; later, you collect it, grade it, and return the
                    graded version to them.
                  </p>
                  <p>
                    <A>Add assignments to your course</A> by clicking "Add Assignment..." above.
                    You can create and select one or more directories and they will become assignments
                    that you can then customize and distribute to your students.
                  </p>`}
                values={{
                  A: (c) => (
                    <a onClick={() => frameActions.setModal("add-assignments")}>
                      {c}
                    </a>
                  ),
                }}
                description={"online course for students"}
              />
            </div>
          }
        />
      </div>
    );
  }

  function render_show_deleted(num_deleted: number, num_shown: number) {
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
            setFilter("");
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

  function header() {
    return (
      <div style={{ marginBottom: "15px" }}>
        <FoldersToolbar
          search={filter}
          search_change={setFilter}
          num_omitted={num_omitted}
          project_id={project_id}
          items={assignments}
          add_folders={course_actions.assignments.addAssignment}
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
}

// used for adding assignments outside of the above component.
export function AddAssignments({ name, actions, close }) {
  const assignments = useRedux(name, "assignments");
  return (
    <AddItems
      itemName="assignment"
      items={assignments}
      addItems={(paths) => {
        actions.assignments.addAssignment(paths);
        close?.();
      }}
      selectorStyle={{
        position: null,
        width: "100%",
        boxShadow: null,
        zIndex: null,
        backgroundColor: null,
      }}
      defaultOpen
      closable={false}
    />
  );
}
