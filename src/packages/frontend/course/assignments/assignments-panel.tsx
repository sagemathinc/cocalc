/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
import {
  Button
} from "@cocalc/frontend/antd-bootstrap";
import {
  AppRedux,
  Component,
  rclass,
  redux,
  Rendered,
  rtypes
} from "@cocalc/frontend/app-framework";
import {
  Icon, Space,
  Tip
} from "@cocalc/frontend/components";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import {
  cmp_array
} from "@cocalc/util/misc";
import { Alert, Col, Row } from "antd";
import { Map, Set } from "immutable";
import { CourseActions } from "../actions";
import { FoldersToolbar } from "../common";
import {
  AssignmentRecord, IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
  StudentRecord
} from "../store";
import * as styles from "../styles";
import * as util from "../util";
import { Assignment } from "./assignment";

interface AssignmentsPanelReactProps {
  frame_id?: string;
  name: string;
  project_id: string;
  redux: AppRedux;
  actions: CourseActions;
  assignments: Map<string, AssignmentRecord>;
  students: Map<string, StudentRecord>;
  user_map: object;
}

interface AssignmentsPanelReduxProps {
  expanded_assignments: Set<string>;
  active_assignment_sort: SortDescription;
  active_student_sort: SortDescription;
  expanded_peer_configs: Set<string>;
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
}

interface AssignmentsPanelState {
  err?: string;
  search: string;
  show_deleted: boolean;
}

export const AssignmentsPanel = rclass<AssignmentsPanelReactProps>(
  class AssignmentsPanel extends Component<
    AssignmentsPanelReactProps & AssignmentsPanelReduxProps,
    AssignmentsPanelState
  > {
    constructor(props) {
      super(props);
      this.state = {
        err: undefined, // error message to display at top.
        search: "", // search query to restrict which assignments are shown.
        show_deleted: false, // whether or not to show deleted assignments on the bottom
      };
    }

    static reduxProps = ({ name }) => {
      return {
        [name]: {
          expanded_assignments: rtypes.immutable.Set,
          active_assignment_sort: rtypes.immutable.Map,
          active_student_sort: rtypes.immutable.Map,
          expanded_peer_configs: rtypes.immutable.Set,
          active_feedback_edits: rtypes.immutable.Map,
          nbgrader_run_info: rtypes.immutable.Map,
        },
      };
    };

    private get_actions(): CourseActions {
      return redux.getActions(this.props.name);
    }

    private get_assignment(id: string): AssignmentRecord {
      const assignment = this.props.assignments.get(id);
      if (assignment == undefined) {
        console.warn(`Tried to access undefined assignment ${id}`);
      }
      return assignment as any;
    }

    private compute_assignment_list(): {
      shown_assignments: any[];
      deleted_assignments: any[];
      num_omitted: number;
      num_deleted: number;
    } {
      let deleted, f, num_deleted, num_omitted;
      let list = util.immutable_to_list(
        this.props.assignments,
        "assignment_id"
      );

      ({ list, num_omitted } = util.compute_match_list({
        list,
        search_key: "path",
        search: this.state.search.trim(),
      }));

      if (this.props.active_assignment_sort.get("column_name") === "due_date") {
        f = (a) => [
          a.due_date != null ? a.due_date : 0,
          a.path != null ? a.path.toLowerCase() : undefined,
        ];
      } else if (
        this.props.active_assignment_sort.get("column_name") === "dir_name"
      ) {
        f = (a) => [
          a.path != null ? a.path.toLowerCase() : undefined,
          a.due_date != null ? a.due_date : 0,
        ];
      }

      ({ list, deleted, num_deleted } = util.order_list({
        list,
        compare_function: (a, b) => cmp_array(f(a), f(b)),
        reverse: this.props.active_assignment_sort.get("is_descending"),
        include_deleted: this.state.show_deleted,
      }));

      return {
        shown_assignments: list,
        deleted_assignments: deleted,
        num_omitted,
        num_deleted,
      };
    }

    private render_sort_link(
      column_name: string,
      display_name: string
    ): Rendered {
      return (
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            return this.get_actions().assignments.set_active_assignment_sort(
              column_name
            );
          }}
        >
          {display_name}
          <Space />
          {this.props.active_assignment_sort.get("column_name") ===
          column_name ? (
            <Icon
              style={{ marginRight: "10px" }}
              name={
                this.props.active_assignment_sort.get("is_descending")
                  ? "caret-up"
                  : "caret-down"
              }
            />
          ) : undefined}
        </a>
      );
    }

    private render_assignment_table_header(): Rendered {
      return (
        <div style={{ borderBottom: "1px solid #e5e5e5" }}>
          <Row style={{ marginRight: "0px" }}>
            <Col md={12}>
              {this.render_sort_link("dir_name", "Assignment Name")}
            </Col>
            <Col md={12}>{this.render_sort_link("due_date", "Due Date")}</Col>
          </Row>
        </div>
      );
    }

    private render_assignment(assignment_id: string, index: number): Rendered {
      return (
        <Assignment
          key={assignment_id}
          project_id={this.props.project_id}
          frame_id={this.props.frame_id}
          name={this.props.name}
          redux={this.props.redux}
          assignment={this.get_assignment(assignment_id)}
          background={index % 2 === 0 ? "#eee" : undefined}
          students={this.props.students}
          user_map={this.props.user_map}
          is_expanded={this.props.expanded_assignments.has(assignment_id)}
          active_student_sort={this.props.active_student_sort}
          expand_peer_config={this.props.expanded_peer_configs.has(
            assignment_id
          )}
          active_feedback_edits={this.props.active_feedback_edits}
          nbgrader_run_info={this.props.nbgrader_run_info}
        />
      );
    }

    private render_assignments(
      assignments: { assignment_id: string }[]
    ): Rendered {
      if (assignments.length == 0) {
        return this.render_no_assignments();
      }
      return (
        <ScrollableList
          windowing={util.windowing(50)}
          rowCount={assignments.length}
          rowRenderer={({ key, index }) => this.render_assignment(key, index)}
          rowKey={(index) => assignments[index]?.assignment_id ?? ""}
          cacheId={`course-assignments-${this.props.name}-${this.props.frame_id}`}
        />
      );
    }

    private render_no_assignments(): Rendered {
      const message = (
        <div>
          <h3>Add an Assignment to your Course</h3>
          <p>
            An assignment is a <i>directory</i> of files somewhere in your
            CoCalc project. You copy the assignment to your students and they
            work on it; later, you collect it, grade it, and return the graded
            version to them.
          </p>

          <p>
            Add an assignment to your course by creating a directory using the
            Files tab, then type the name of the directory in the box in the
            upper right and click to search.
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

    private render_show_deleted(
      num_deleted: number,
      num_shown: number
    ): Rendered {
      if (this.state.show_deleted) {
        return (
          <Button
            style={styles.show_hide_deleted({ needs_margin: num_shown > 0 })}
            onClick={() => this.setState({ show_deleted: false })}
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
            onClick={() => this.setState({ show_deleted: true, search: "" })}
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

    private yield_adder(deleted_assignments): (string) => void {
      const deleted_paths = {};
      deleted_assignments.map((obj) => {
        if (obj.path) {
          deleted_paths[obj.path] = obj.assignment_id;
        }
      });

      return (path) => {
        if (deleted_paths[path] != null) {
          this.get_actions().assignments.undelete_assignment(
            deleted_paths[path]
          );
        } else {
          this.get_actions().assignments.add_assignment(path);
        }
      };
    }

    public render(): Rendered {
      const {
        shown_assignments,
        deleted_assignments,
        num_omitted,
        num_deleted,
      } = this.compute_assignment_list();

      const add_assignment = this.yield_adder(deleted_assignments);

      const header = (
        <div style={{ marginBottom: "15px" }}>
          <FoldersToolbar
            search={this.state.search}
            search_change={(value) => this.setState({ search: value })}
            num_omitted={num_omitted}
            project_id={this.props.project_id}
            items={this.props.assignments}
            add_folders={(paths) => paths.map(add_assignment)}
            item_name={"assignment"}
            plural_item_name={"assignments"}
          />
        </div>
      );

      return (
        <div className={"smc-vfill"} style={{ margin: "0" }}>
          {header}
          {shown_assignments.length > 0
            ? this.render_assignment_table_header()
            : undefined}
          <div className="smc-vfill">
            {this.render_assignments(shown_assignments)}{" "}
            {num_deleted
              ? this.render_show_deleted(num_deleted, shown_assignments.length)
              : undefined}
          </div>
        </div>
      );
    }
  }
);

export function AssignmentsPanelHeader(props: { n: number }) {
  return (
    <Tip
      delayShow={1300}
      title="Assignments"
      tip="This tab lists all of the assignments associated to your course, along with student grades and status about each assignment.  You can also quickly find assignments by name on the left.   An assignment is a directory in your project, which may contain any files.  Add an assignment to your course by searching for the directory name in the search box on the right."
    >
      <span>
        <Icon name="share-square" /> Assignments{" "}
        {props.n != null ? ` (${props.n})` : ""}
      </span>
    </Tip>
  );
}
