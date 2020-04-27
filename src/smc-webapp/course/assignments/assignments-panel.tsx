

// CoCalc libraries
import * as misc from "smc-util/misc";
import { webapp_client } from "../../webapp-client";

import { STUDENT_SUBDIR } from "./actions";
import { AssignmentCopyStep, AssignmentStatus } from "../types";

// React libraries
import {
  Component,
  React,
  rclass,
  rtypes,
  redux,
  AppRedux,
  Rendered,
} from "../../app-framework";

import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
} from "../../antd-bootstrap";

import { Alert, Card, Row, Col } from "antd";

import { Set, Map } from "immutable";

// CoCalc and course components
import * as util from "../util";
import * as styles from "../styles";
import {
  StudentRecord,
  AssignmentRecord,
  SortDescription,
  CourseStore,
  IsGradingMap,
  NBgraderRunInfo,
} from "../store";
import { CourseActions } from "../actions";
import { ReactElement } from "react";
import {
  DateTimePicker,
  Icon,
  Loading,
  MarkdownInput,
  Space,
  Tip,
  WindowedList,
} from "../../r_misc";

import { STEPS, step_direction, step_verb, step_ready } from "../util";

import {
  BigTime,
  FoldersToolbar,
  StudentAssignmentInfo,
  StudentAssignmentInfoHeader,
} from "../common";

import { Progress } from "../common/progress";
import { SkipCopy } from "./skip";

import { ConfigurePeerGrading } from "./configure-peer";

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
        compare_function: (a, b) => misc.cmp_array(f(a), f(b)),
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
        <WindowedList
          overscan_row_count={3}
          estimated_row_size={50}
          row_count={assignments.length}
          row_renderer={({ key, index }) => this.render_assignment(key, index)}
          row_key={(index) =>
            assignments[index] != null
              ? assignments[index].assignment_id
              : undefined
          }
          cache_id={`course-assignments-${this.props.name}-${this.props.frame_id}`}
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
        <div className={"smc-vfill"} style={{ margin: "0 15px" }}>
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
        <Icon name="share-square-o" /> Assignments{" "}
        {props.n != null ? ` (${props.n})` : ""}
      </span>
    </Tip>
  );
}

interface AssignmentProps {
  name: string;
  frame_id?: string;
  project_id: string;
  redux: AppRedux;

  assignment: AssignmentRecord;
  background?: string;
  students: object;
  user_map: object;
  is_expanded?: boolean;
  active_student_sort: SortDescription;
  expand_peer_config?: boolean;
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
}

interface AssignmentState {
  confirm_delete: boolean;
  copy_assignment_confirm_overwrite: boolean;
  copy_assignment_confirm_overwrite_text: string;
  copy_confirm: boolean;
  copy_confirm_assignment: boolean;
  copy_confirm_collect: boolean;
  copy_confirm_peer_assignment: boolean;
  copy_confirm_peer_collect: boolean;
  copy_confirm_return_graded: boolean;
}

class Assignment extends Component<AssignmentProps, AssignmentState> {
  constructor(props) {
    super(props);
    this.state = {
      confirm_delete: false,
      copy_assignment_confirm_overwrite: false,
      copy_assignment_confirm_overwrite_text: "",
      copy_confirm: false,
      copy_confirm_assignment: false,
      copy_confirm_collect: false,
      copy_confirm_peer_assignment: false,
      copy_confirm_peer_collect: false,
      copy_confirm_return_graded: false,
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    // state is an object with tons of keys and values true/false
    return (
      !misc.is_equal(this.state, nextState) ||
      misc.is_different(this.props, nextProps, [
        "assignment",
        "students",
        "user_map",
        "background",
        "is_expanded",
        "active_student_sort",
        "expand_peer_config",
        "active_feedback_edits",
        "nbgrader_run_info",
      ])
    );
  }

  get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  get_store(): CourseStore {
    return redux.getStore(this.props.name) as any;
  }

  is_peer_graded() {
    return !!this.props.assignment.getIn(["peer_grade", "enabled"]);
  }

  _due_date() {
    const due_date = this.props.assignment.get("due_date"); // a string
    if (due_date == null) {
      return webapp_client.server_time();
    } else {
      return new Date(due_date);
    }
  }

  render_due() {
    return (
      <Row>
        <Col xs={2} style={{ marginTop: "8px", color: "#666" }}>
          <Tip
            placement="top"
            title="Set the due date"
            tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment)."
          >
            Due
          </Tip>
        </Col>
        <Col xs={22}>
          <DateTimePicker
            placeholder={"Set Assignment Due Date"}
            value={this.props.assignment.get("due_date")}
            onChange={this.date_change}
          />
        </Col>
      </Row>
    );
  }

  date_change = (date) => {
    this.get_actions().assignments.set_due_date(
      this.props.assignment.get("assignment_id"),
      date != null ? date.toISOString() : undefined
    );
  };

  render_note() {
    return (
      <Row key="note" style={styles.note}>
        <Col xs={4}>
          <Tip
            title="Notes about this assignment"
            tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment."
          >
            Private Assignment Notes
            <br />
            <span style={{ color: "#666" }} />
          </Tip>
        </Col>
        <Col xs={20}>
          <MarkdownInput
            persist_id={
              this.props.assignment.get("path") +
              this.props.assignment.get("assignment_id") +
              "note"
            }
            attach_to={this.props.name}
            rows={6}
            placeholder="Private notes about this assignment (not visible to students)"
            default_value={this.props.assignment.get("note")}
            on_save={(value) =>
              this.get_actions().assignments.set_assignment_note(
                this.props.assignment.get("assignment_id"),
                value
              )
            }
          />
        </Col>
      </Row>
    );
  }

  private render_export_file_use_times(): Rendered {
    return (
      <Row key="file-use-times-export-used">
        <Col xs={4}>
          <Tip
            title="Export when students used files"
            tip="Export a JSON file containing extensive information about exactly when students have opened or edited files in this assignment.  The JSON file will open in a new tab; the access_times (in milliseconds since the UNIX epoch) are when they opened the file and the edit_times are when they actually changed it through CoCalc's web-based editor."
          >
            Export file use times
            <br />
            <span style={{ color: "#666" }} />
          </Tip>
        </Col>
        <Col xs={20}>
          <Button
            onClick={() =>
              this.get_actions().export.file_use_times(
                this.props.assignment.get("assignment_id")
              )
            }
          >
            Export file use times for this assignment
          </Button>
        </Col>
      </Row>
    );
  }

  private render_export_assignment(): Rendered {
    return (
      <Row key="file-use-times-export-collected">
        <Col xs={4}>
          <Tip
            title="Export collected student files"
            tip="Export all student work to files in a single directory that are easy to grade or archive outside of CoCalc.  Any Jupyter notebooks or Sage worksheets are first converted to PDF (if possible), and all files are renamed with the student as a filename prefix."
          >
            Export collected student files
            <br />
            <span style={{ color: "#666" }} />
          </Tip>
        </Col>
        <Col xs={20}>
          <Button
            onClick={() =>
              this.get_actions().assignments.export_collected(
                this.props.assignment.get("assignment_id")
              )
            }
          >
            Export collected student files to single directory, converting
            notebooks to pdf
          </Button>
        </Col>
      </Row>
    );
  }

  render_more_header() {
    let width;
    const status:
      | AssignmentStatus
      | undefined = this.get_store().get_assignment_status(
      this.props.assignment.get("assignment_id")
    );
    if (status == null) {
      return <Loading key="loading_more" />;
    }
    const v: ReactElement<any>[] = [];

    const bottom = {
      borderBottom: "1px solid grey",
      paddingBottom: "15px",
      marginBottom: "15px",
    };
    v.push(
      <Row key="header3" style={bottom}>
        <Col md={4}>{this.render_open_button()}</Col>
        <Col md={20}>
          <Row>
            <Col md={12} style={{ fontSize: "14px" }} key="due">
              {this.render_due()}
            </Col>
            <Col md={12} key="delete">
              <Row>
                <Col md={14}>{this.render_peer_button()}</Col>
                <Col md={10}>
                  <span className="pull-right">
                    {this.render_delete_button()}
                  </span>
                </Col>
              </Row>
            </Col>
          </Row>
        </Col>
      </Row>
    );

    if (this.props.expand_peer_config) {
      v.push(
        <Row key="header2-peer" style={bottom}>
          <Col md={20} offset={4}>
            {this.render_configure_peer()}
          </Col>
        </Row>
      );
    }
    if (this.state.confirm_delete) {
      v.push(
        <Row key="header2-delete" style={bottom}>
          <Col md={20} offset={4}>
            {this.render_confirm_delete()}
          </Col>
        </Row>
      );
    }

    const peer = this.is_peer_graded();
    if (peer) {
      width = 4;
    } else {
      width = 6;
    }
    const buttons: ReactElement<any>[] = [];
    const insert_grade_button = (key: string) => {
      const b2 = this.render_skip_grading_button(status);
      return buttons.push(
        <Col md={width} key={key}>
          {this.render_nbgrader_button(status)}
          {b2}
        </Col>
      );
    };

    for (const name of STEPS(peer)) {
      const b = this[`render_${name}_button`](status);
      // squeeze in the skip grading button (don't add it to STEPS!)
      if (!peer && name === "return_graded") {
        insert_grade_button("skip_grading");
      }
      if (b != null) {
        buttons.push(
          <Col md={width} key={name}>
            {b}
          </Col>
        );
        if (peer && name === "peer_collect") {
          insert_grade_button("skip_peer_collect");
        }
      }
    }

    v.push(
      <Row key="header-control">
        <Col md={20} offset={4} key="buttons">
          <Row>{buttons}</Row>
        </Col>
      </Row>
    );

    v.push(
      <Row key="header2-copy">
        <Col md={20} offset={4}>
          {this.render_copy_confirms(status)}
        </Col>
      </Row>
    );

    return v;
  }

  render_more() {
    return (
      <Row key="more">
        <Col sm={24}>
          <Card title={this.render_more_header()}>
            <StudentListForAssignment
              redux={this.props.redux}
              frame_id={this.props.frame_id}
              name={this.props.name}
              assignment={this.props.assignment}
              students={this.props.students}
              user_map={this.props.user_map}
              active_student_sort={this.props.active_student_sort}
              active_feedback_edits={this.props.active_feedback_edits}
              nbgrader_run_info={this.props.nbgrader_run_info}
            />
            {this.render_note()}
            <br />
            <hr />
            <br />
            {this.render_export_file_use_times()}
            <br />
            {this.render_export_assignment()}
          </Card>
        </Col>
      </Row>
    );
  }

  open_assignment_path = () => {
    return redux
      .getProjectActions(this.props.project_id)
      .open_directory(this.props.assignment.get("path"));
  };

  render_open_button() {
    return (
      <Tip
        key="open"
        title={
          <span>
            <Icon name="folder-open-o" /> Open assignment
          </span>
        }
        tip="Open the folder in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment."
      >
        <Button onClick={this.open_assignment_path}>
          <Icon name="folder-open-o" /> Open
        </Button>
      </Tip>
    );
  }

  private show_copy_confirm(): void {
    this.setState({ copy_confirm_assignment: true, copy_confirm: true });
    const actions = this.get_actions();
    const assignment_id: string | undefined = this.props.assignment.get(
      "assignment_id"
    );
    actions.assignments.has_student_subdir(assignment_id);
  }

  render_assignment_button(status) {
    let bsStyle;
    const last_assignment = this.props.assignment.get("last_assignment");
    // Primary if it hasn't been assigned before or if it hasn't started assigning.
    if (
      !last_assignment ||
      !(last_assignment.get("time") || last_assignment.get("start"))
    ) {
      bsStyle = "primary";
    } else {
      bsStyle = "warning";
    }
    if (status.assignment > 0 && status.not_assignment === 0) {
      bsStyle = "success";
    }

    return [
      <Button
        key="assign"
        bsStyle={bsStyle}
        onClick={this.show_copy_confirm.bind(this)}
        disabled={this.state.copy_confirm}
      >
        <Tip
          title={
            <span>
              Assign: <Icon name="user-secret" /> You{" "}
              <Icon name="long-arrow-right" /> <Icon name="users" /> Students{" "}
            </span>
          }
          tip="Copy the files for this assignment from this project to all other student projects."
        >
          <Icon name="share-square-o" /> Assign...
        </Tip>
      </Button>,
      <Progress
        key="progress"
        done={status.assignment}
        not_done={status.not_assignment}
        step="assigned"
        skipped={this.props.assignment.get("skip_assignment")}
      />,
    ];
  }

  render_copy_confirms(status) {
    const steps = STEPS(this.is_peer_graded());
    const result: (ReactElement<any> | undefined)[] = [];
    for (const step of steps) {
      if (this.state[`copy_confirm_${step}`]) {
        result.push(this.render_copy_confirm(step, status));
      } else {
        result.push(undefined);
      }
    }
    return result;
  }

  render_copy_confirm(step, status) {
    return (
      <span key={`copy_confirm_${step}`}>
        {status[step] === 0
          ? this.render_copy_confirm_to_all(step, status)
          : undefined}
        {status[step] !== 0
          ? this.render_copy_confirm_to_all_or_new(step, status)
          : undefined}
      </span>
    );
  }

  render_copy_cancel(step) {
    const cancel = () => {
      return this.setState({
        [`copy_confirm_${step}`]: false,
        [`copy_confirm_all_${step}`]: false,
        copy_confirm: false,
        copy_assignment_confirm_overwrite: false,
      } as any);
    };
    return (
      <Button key="cancel" onClick={cancel}>
        Close
      </Button>
    );
  }

  render_copy_assignment_confirm_overwrite(step) {
    if (!this.state.copy_assignment_confirm_overwrite) {
      return;
    }
    const do_it = () => {
      this.copy_assignment(step, false, true);
      return this.setState({
        copy_assignment_confirm_overwrite: false,
        copy_assignment_confirm_overwrite_text: "",
      });
    };
    return (
      <div style={{ marginTop: "15px" }}>
        Type in "OVERWRITE" if you are sure you want to overwrite any work they
        may have.
        <FormGroup>
          <FormControl
            autoFocus
            type="text"
            ref="copy_assignment_confirm_overwrite_field"
            onChange={(e) =>
              this.setState({
                copy_assignment_confirm_overwrite_text: (e.target as any).value,
              })
            }
            style={{ marginTop: "1ex" }}
          />
        </FormGroup>
        <ButtonGroup style={{ textAlign: "center", marginTop: "15px" }}>
          <Button
            disabled={
              this.state.copy_assignment_confirm_overwrite_text !== "OVERWRITE"
            }
            bsStyle="danger"
            onClick={do_it}
          >
            <Icon name="exclamation-triangle" /> Confirm replacing files
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonGroup>
      </div>
    );
  }

  copy_assignment(step, new_only: boolean, overwrite: boolean = false) {
    // assign assignment to all (non-deleted) students
    const actions = this.get_actions();
    const assignment_id: string | undefined = this.props.assignment.get(
      "assignment_id"
    );
    if (assignment_id == null) throw Error("bug");
    switch (step) {
      case "assignment":
        actions.assignments.copy_assignment_to_all_students(
          assignment_id,
          new_only,
          overwrite
        );
        break;
      case "collect":
        actions.assignments.copy_assignment_from_all_students(
          assignment_id,
          new_only
        );
        break;
      case "peer_assignment":
        actions.assignments.peer_copy_to_all_students(assignment_id, new_only);
        break;
      case "peer_collect":
        actions.assignments.peer_collect_from_all_students(
          assignment_id,
          new_only
        );
        break;
      case "return_graded":
        actions.assignments.return_assignment_to_all_students(
          assignment_id,
          new_only
        );
        break;
      default:
        console.log(`BUG -- unknown step: ${step}`);
    }
    this.setState({
      [`copy_confirm_${step}`]: false,
      [`copy_confirm_all_${step}`]: false,
      copy_confirm: false,
    } as any);
  }

  private render_skip(step: AssignmentCopyStep): Rendered {
    if (step === "return_graded") {
      return;
    }
    return (
      <div style={{ float: "right" }}>
        <SkipCopy
          assignment={this.props.assignment}
          step={step}
          actions={this.get_actions()}
        />
      </div>
    );
  }

  private render_has_student_subdir(step: AssignmentCopyStep): Rendered {
    if (
      step != "assignment" ||
      !this.props.assignment.get("has_student_subdir")
    )
      return;
    return (
      <Alert
        style={{ marginBottom: "15px" }}
        type="info"
        message={`NOTE: Only the ${STUDENT_SUBDIR}/ subdirectory will be copied to the students.`}
      />
    );
  }

  private render_copy_confirm_to_all(
    step: AssignmentCopyStep,
    status
  ): Rendered {
    const n = status[`not_${step}`];
    const message = (
      <div>
        {" "}
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this homework{" "}
          {step_direction(step)} the {n} student{n > 1 ? "s" : ""}
          {step_ready(step, n)}?
        </div>
        {this.render_has_student_subdir(step)}
        {this.render_skip(step)}
        <ButtonGroup>
          <Button
            key="yes"
            bsStyle="primary"
            onClick={() => this.copy_assignment(step, false)}
          >
            Yes
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonGroup>
      </div>
    );
    return (
      <Alert
        type="warning"
        key={`${step}_confirm_to_all`}
        style={{ marginTop: "15px" }}
        message={message}
      />
    );
  }

  private copy_confirm_all_caution(
    step: AssignmentCopyStep
  ): Rendered | string {
    switch (step) {
      case "assignment":
        return (
          <span>
            This will recopy all of the files to them. CAUTION: if you update a
            file that a student has also worked on, their work will get copied
            to a backup file ending in a tilde, or possibly only be available in
            snapshots. Select "Replace student files!" in case you do <b>not</b>{" "}
            want to create any backups and also <b>delete</b> all other files in
            the assignment directory of their projects.{" "}
            <a
              target="_blank"
              href="https://github.com/sagemathinc/cocalc/wiki/CourseCopy"
            >
              (more details)
            </a>
            .
          </span>
        );
      case "collect":
        return "This will recollect all of the homework from them.  CAUTION: if you have graded/edited a file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.";
      case "return_graded":
        return "This will rereturn all of the graded files to them.";
      case "peer_assignment":
        return "This will recopy all of the files to them.  CAUTION: if there is a file a student has also worked on grading, their work will get copied to a backup file ending in a tilde, or possibly be only available in snapshots.";
      case "peer_collect":
        return "This will recollect all of the peer-graded homework from the students.  CAUTION: if you have graded/edited a previously collected file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.";
    }
  }

  private render_copy_confirm_overwrite_all(
    step: AssignmentCopyStep
  ): Rendered {
    return (
      <div key={"copy_confirm_overwrite_all"} style={{ marginTop: "15px" }}>
        <div style={{ marginBottom: "15px" }}>
          {this.copy_confirm_all_caution(step)}
        </div>
        <ButtonGroup>
          <Button
            key={"all"}
            bsStyle={"warning"}
            disabled={this.state.copy_assignment_confirm_overwrite}
            onClick={() => this.copy_assignment(step, false)}
          >
            Yes, do it (with backup)
          </Button>
          {step === "assignment" ? (
            <Button
              key={"all-overwrite"}
              bsStyle={"warning"}
              onClick={() =>
                this.setState({ copy_assignment_confirm_overwrite: true })
              }
              disabled={this.state.copy_assignment_confirm_overwrite}
            >
              Replace student files!
            </Button>
          ) : undefined}
          {this.render_copy_cancel(step)}
        </ButtonGroup>
        {this.render_copy_assignment_confirm_overwrite(step)}
      </div>
    );
  }

  private render_copy_confirm_to_all_or_new(
    step: AssignmentCopyStep,
    status
  ): Rendered {
    const n = status[`not_${step}`];
    const m = n + status[step];
    const message = (
      <div>
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this homework{" "}
          {step_direction(step)}...
        </div>
        {this.render_has_student_subdir(step)}
        {this.render_skip(step)}
        <ButtonGroup>
          <Button
            key="all"
            bsStyle="danger"
            onClick={() =>
              this.setState({
                [`copy_confirm_all_${step}`]: true,
                copy_confirm: true,
              } as any)
            }
            disabled={this.state[`copy_confirm_all_${step}`]}
          >
            {step === "assignment" ? "All" : "The"} {m} students
            {step_ready(step, m)}...
          </Button>
          {n ? (
            <Button
              key="new"
              bsStyle="primary"
              onClick={() => this.copy_assignment(step, true)}
            >
              The {n} student{n > 1 ? "s" : ""} not already {step_verb(step)}ed{" "}
              {step_direction(step)}
            </Button>
          ) : undefined}
          {this.render_copy_cancel(step)}
        </ButtonGroup>
        {this.state[`copy_confirm_all_${step}`]
          ? this.render_copy_confirm_overwrite_all(step)
          : undefined}
      </div>
    );
    return (
      <Alert
        type="warning"
        key={`${step}_confirm_to_all_or_new`}
        style={{ marginTop: "15px" }}
        message={message}
      />
    );
  }

  render_collect_tip() {
    return (
      <span key="normal">
        Collect an assignment from all of your students. (There is currently no
        way to schedule collection at a specific time; instead, collection
        happens when you click the button.)
      </span>
    );
  }

  render_collect_button(status) {
    let bsStyle;
    if (status.assignment === 0) {
      // no button if nothing ever assigned
      return;
    }
    if (status.collect > 0) {
      // Have already collected something
      if (status.not_collect === 0) {
        bsStyle = "success";
      } else {
        bsStyle = "warning";
      }
    } else {
      bsStyle = "primary";
    }
    return [
      <Button
        key="collect"
        onClick={() =>
          this.setState({ copy_confirm_collect: true, copy_confirm: true })
        }
        disabled={this.state.copy_confirm}
        bsStyle={bsStyle}
      >
        <Tip
          title={
            <span>
              Collect: <Icon name="users" /> Students{" "}
              <Icon name="long-arrow-right" /> <Icon name="user-secret" /> You
            </span>
          }
          tip={this.render_collect_tip()}
        >
          <Icon name="share-square-o" rotate={"180"} /> Collect...
        </Tip>
      </Button>,
      <Progress
        key="progress"
        done={status.collect}
        not_done={status.not_collect}
        step="collected"
        skipped={this.props.assignment.get("skip_collect")}
      />,
    ];
  }

  render_peer_assign_tip() {
    return (
      <span key="normal">
        Send copies of collected homework out to all students for peer grading.
      </span>
    );
  }

  render_peer_assignment_button(status) {
    // Render the "Peer Assign..." button in the top row, for peer assigning to all
    // students in the course.
    let bsStyle;
    if (status.peer_assignment == null) {
      // not peer graded
      return;
    }
    if (status.not_collect + status.not_assignment > 0) {
      // collect everything before peer grading
      return;
    }
    if (status.collect === 0) {
      // nothing to peer assign
      return;
    }
    if (status.peer_assignment > 0) {
      // haven't peer-assigned anything yet
      if (status.not_peer_assignment === 0) {
        bsStyle = "success";
      } else {
        bsStyle = "warning";
      }
    } else {
      // warning, since we have assigned already and this may overwrite
      bsStyle = "primary";
    }
    return [
      <Button
        key="peer-assign"
        onClick={() =>
          this.setState({
            copy_confirm_peer_assignment: true,
            copy_confirm: true,
          })
        }
        disabled={this.state.copy_confirm}
        bsStyle={bsStyle}
      >
        <Tip
          title={
            <span>
              Peer Assign: <Icon name="users" /> You{" "}
              <Icon name="long-arrow-right" /> <Icon name="user-secret" />{" "}
              Students
            </span>
          }
          tip={this.render_peer_assign_tip()}
        >
          <Icon name="share-square-o" /> Peer Assign...
        </Tip>
      </Button>,
      <Progress
        key="progress"
        done={status.peer_assignment}
        not_done={status.not_peer_assignment}
        step="peer assigned"
      />,
    ];
  }

  render_peer_collect_tip() {
    return (
      <span key="normal">Collect the peer grading that your students did.</span>
    );
  }

  render_peer_collect_button(status) {
    // Render the "Peer Collect..." button in the top row, for collecting peer grading from all
    // students in the course.
    let bsStyle;
    if (status.peer_collect == null) {
      return;
    }
    if (status.peer_assignment === 0) {
      // haven't even peer assigned anything -- so nothing to collect
      return;
    }
    if (status.not_peer_assignment > 0) {
      // everybody must have received peer assignment, or collecting isn't allowed
      return;
    }
    if (status.peer_collect > 0) {
      // haven't peer-collected anything yet
      if (status.not_peer_collect === 0) {
        bsStyle = "success";
      } else {
        bsStyle = "warning";
      }
    } else {
      // warning, since we have already collected and this may overwrite
      bsStyle = "primary";
    }
    return [
      <Button
        key="peer-collect"
        onClick={() =>
          this.setState({ copy_confirm_peer_collect: true, copy_confirm: true })
        }
        disabled={this.state.copy_confirm}
        bsStyle={bsStyle}
      >
        <Tip
          title={
            <span>
              Peer Collect: <Icon name="users" /> Students{" "}
              <Icon name="long-arrow-right" /> <Icon name="user-secret" /> You
            </span>
          }
          tip={this.render_peer_collect_tip()}
        >
          <Icon name="share-square-o" rotate="180" /> Peer Collect...
        </Tip>
      </Button>,
      <Progress
        key="progress"
        done={status.peer_collect}
        not_done={status.not_peer_collect}
        step="peer collected"
      />,
    ];
  }

  return_assignment = () => {
    // Return assignment to all (non-deleted) students.
    this.get_actions().assignments.return_assignment_to_all_students(
      this.props.assignment.get("assignment_id"),
      false
    );
  };

  toggle_skip_grading = () => {
    this.get_actions().assignments.set_skip(
      this.props.assignment.get("assignment_id"),
      "grading",
      !this.props.assignment.get("skip_grading")
    );
  };

  render_skip_grading_button(status) {
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    const icon: string = this.props.assignment.get("skip_grading")
      ? "check-square-o"
      : "square-o";
    return (
      <Button onClick={this.toggle_skip_grading}>
        <Icon name={icon} /> Skip grading
      </Button>
    );
  }

  render_nbgrader_button(status) {
    if (
      status.collect === 0 ||
      !this.props.assignment.get("nbgrader") ||
      this.props.assignment.get("skip_grading")
    ) {
      // No button if nothing collected or not nbgrader support or
      // decided to skip grading this.
      return;
    }
    let running = false;
    if (this.props.nbgrader_run_info != null) {
      const t = this.props.nbgrader_run_info.get(
        this.props.assignment.get("assignment_id")
      );
      if (t && new Date().valueOf() - t <= 1000 * 60 * 10) {
        // Time starting is set and it's also within the last few minutes.
        // This "few minutes" is just in case -- we probably shouldn't need
        // that at all ever, but it could make cocalc state usable in case of
        // weird issues, I guess).  User could also just close and re-open
        // the course file, which resets this state completely.
        running = true;
      }
    }
    const label = running ? (
      <span>
        {" "}
        <Icon name="cc-icon-cocalc-ring" spin /> Running nbgrader
      </span>
    ) : (
      <span>Run nbgrader</span>
    );
    return (
      <div style={{ marginBottom: "5px 0" }}>
        <Button
          disabled={running}
          key="nbgrader"
          onClick={() => {
            this.get_actions().assignments.run_nbgrader_for_all_students(
              this.props.assignment.get("assignment_id")
            );
          }}
        >
          <Icon name="graduation-cap" /> {label}
        </Button>
      </div>
    );
  }

  render_return_graded_button(status) {
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    if (status.peer_collect != null && status.peer_collect === 0) {
      // Peer grading enabled, but we didn't collect anything yet
      return;
    }
    if (
      !this.props.assignment.get("skip_grading") &&
      status.not_return_graded === 0 &&
      status.return_graded === 0
    ) {
      // Nothing unreturned and ungraded yet and also nothing returned yet
      return;
    }
    let bsStyle: string;
    if (status.return_graded > 0) {
      // Have already returned some
      if (status.not_return_graded === 0) {
        bsStyle = "success";
      } else {
        bsStyle = "warning";
      }
    } else {
      bsStyle = "primary";
    }
    return [
      <Button
        key="return"
        onClick={() =>
          this.setState({
            copy_confirm_return_graded: true,
            copy_confirm: true,
          })
        }
        disabled={this.state.copy_confirm}
        bsStyle={bsStyle}
      >
        <Tip
          title={
            <span>
              Return: <Icon name="user-secret" /> You{" "}
              <Icon name="long-arrow-right" /> <Icon name="users" /> Students{" "}
            </span>
          }
          tip="Copy the graded versions of files for this assignment from this project to all other student projects."
        >
          <Icon name="share-square-o" /> Return...
        </Tip>
      </Button>,
      <Progress
        key="progress"
        done={status.return_graded}
        not_done={status.not_return_graded}
        step="returned"
      />,
    ];
  }

  delete_assignment = () => {
    this.get_actions().assignments.delete_assignment(
      this.props.assignment.get("assignment_id")
    );
    return this.setState({ confirm_delete: false });
  };

  undelete_assignment = () => {
    return this.get_actions().assignments.undelete_assignment(
      this.props.assignment.get("assignment_id")
    );
  };

  render_confirm_delete() {
    const message = (
      <div>
        Are you sure you want to delete this assignment (you can undelete it
        later)?
        <br /> <br />
        <ButtonGroup>
          <Button key="yes" onClick={this.delete_assignment} bsStyle="danger">
            <Icon name="trash" /> Delete
          </Button>
          <Button
            key="no"
            onClick={() => this.setState({ confirm_delete: false })}
          >
            Cancel
          </Button>
        </ButtonGroup>
      </div>
    );
    return <Alert type="warning" key="confirm_delete" message={message} />;
  }

  render_delete_button() {
    if (this.props.assignment.get("deleted")) {
      return (
        <Tip
          key="delete"
          placement="left"
          title="Undelete assignment"
          tip="Make the assignment visible again in the assignment list and in student grade lists."
        >
          <Button onClick={this.undelete_assignment}>
            <Icon name="trash-o" /> Undelete
          </Button>
        </Tip>
      );
    } else {
      return (
        <Tip
          key="delete"
          placement="left"
          title="Delete assignment"
          tip="Deleting this assignment removes it from the assignment list and student grade lists, but does not delete any files off of disk.  You can always undelete an assignment later by showing it using the 'show deleted assignments' button."
        >
          <Button
            onClick={() => this.setState({ confirm_delete: true })}
            disabled={this.state.confirm_delete}
          >
            <Icon name="trash" /> Delete
          </Button>
        </Tip>
      );
    }
  }

  render_configure_peer() {
    return (
      <ConfigurePeerGrading
        actions={this.get_actions()}
        assignment={this.props.assignment}
      />
    );
  }

  render_peer_button() {
    let icon;
    if (this.is_peer_graded()) {
      icon = "check-square-o";
    } else {
      icon = "square-o";
    }
    return (
      <Button
        disabled={this.props.expand_peer_config}
        onClick={() =>
          this.get_actions().toggle_item_expansion(
            "peer_config",
            this.props.assignment.get("assignment_id")
          )
        }
      >
        <Icon name={icon} /> Peer Grading...
      </Button>
    );
  }

  render_summary_due_date() {
    const due_date = this.props.assignment.get("due_date");
    if (due_date) {
      return (
        <div style={{ marginTop: "12px" }}>
          Due <BigTime date={due_date} />
        </div>
      );
    }
  }

  render_assignment_name() {
    return (
      <span>
        {misc.trunc_middle(this.props.assignment.get("path"), 80)}
        {this.props.assignment.get("deleted") ? <b> (deleted)</b> : undefined}
      </span>
    );
  }

  render_assignment_title_link() {
    return (
      <a
        href=""
        onClick={(e) => {
          e.preventDefault();
          return this.get_actions().toggle_item_expansion(
            "assignment",
            this.props.assignment.get("assignment_id")
          );
        }}
      >
        <Icon
          style={{ marginRight: "10px" }}
          name={this.props.is_expanded ? "caret-down" : "caret-right"}
        />
        {this.render_assignment_name()}
      </a>
    );
  }

  render_summary_line() {
    return (
      <Row key="summary" style={{ backgroundColor: this.props.background }}>
        <Col md={12}>
          <h5>{this.render_assignment_title_link()}</h5>
        </Col>
        <Col md={12}>{this.render_summary_due_date()}</Col>
      </Row>
    );
  }

  render() {
    return (
      <div>
        <Row
          style={
            this.props.is_expanded ? styles.selected_entry : styles.entry_style
          }
        >
          <Col xs={24}>
            {this.render_summary_line()}
            {this.props.is_expanded ? this.render_more() : undefined}
          </Col>
        </Row>
      </div>
    );
  }
}

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
}

class StudentListForAssignment extends Component<
  StudentListForAssignmentProps
> {
  private student_list: string[] | undefined = undefined;

  public shouldComponentUpdate(props): boolean {
    const x: boolean = misc.is_different(this.props, props, [
      "assignment",
      "students",
      "user_map",
      "background",
      "active_student_sort",
      "active_feedback_edits",
      "nbgrader_run_info",
    ]);
    if (x) {
      delete this.student_list;
    }
    return x;
  }

  private get_store(): CourseStore {
    return redux.getStore(this.props.name) as any;
  }

  private is_peer_graded(): boolean {
    const peer_info = this.props.assignment.get("peer_grade");
    return peer_info ? peer_info.get("enabled") : false;
  }

  private render_student_info(student_id: string): Rendered {
    const store = this.get_store();
    const student = store.get_student(student_id);
    if (student == null) return; // no such student
    const key = util.assignment_identifier(
      this.props.assignment.get("assignment_id"),
      student_id
    );
    const edited_feedback = this.props.active_feedback_edits.get(key);
    let edited_comments: string | undefined;
    let edited_grade: string | undefined;
    if (edited_feedback != undefined) {
      edited_comments = edited_feedback.get("edited_comments");
      edited_grade = edited_feedback.get("edited_grade");
    }
    return (
      <StudentAssignmentInfo
        key={student_id}
        title={misc.trunc_middle(store.get_student_name(student_id), 40)}
        name={this.props.name}
        student={student}
        assignment={this.props.assignment}
        grade={store.get_grade(
          this.props.assignment.get("assignment_id"),
          student_id
        )}
        nbgrader_scores={store.get_nbgrader_scores(
          this.props.assignment.get("assignment_id"),
          student_id
        )}
        comments={store.get_comments(
          this.props.assignment.get("assignment_id"),
          student_id
        )}
        info={store.student_assignment_info(
          student_id,
          this.props.assignment.get("assignment_id")
        )}
        is_editing={!!edited_feedback}
        edited_comments={edited_comments}
        edited_grade={edited_grade}
        nbgrader_run_info={this.props.nbgrader_run_info}
      />
    );
  }

  private get_student_list(): string[] {
    if (this.student_list != null) {
      return this.student_list;
    }

    const v0 = util.parse_students(
      this.props.students,
      this.props.user_map,
      this.props.redux
    );

    // Remove deleted students
    const v1: any[] = [];
    for (const x of v0) {
      if (!x.deleted) v1.push(x);
    }

    v1.sort(util.pick_student_sorter(this.props.active_student_sort.toJS()));

    if (this.props.active_student_sort.get("is_descending")) {
      v1.reverse();
    }

    this.student_list = [];
    for (const x of v1) {
      this.student_list.push(x.student_id);
    }

    return this.student_list;
  }

  private render_students(): Rendered {
    const info = this.get_student_list();
    return (
      <WindowedList
        overscan_row_count={3}
        estimated_row_size={65}
        row_count={info.length}
        row_renderer={({ key }) => this.render_student_info(key)}
        row_key={(index) => this.get_student_list()[index]}
        cache_id={`course-assignment-${this.props.assignment.get(
          "assignment_id"
        )}-${this.props.name}-${this.props.frame_id}`}
      />
    );
  }

  public render(): Rendered {
    return (
      <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
        <StudentAssignmentInfoHeader
          key="header"
          title="Student"
          peer_grade={this.is_peer_graded()}
        />
        {this.render_students()}
      </div>
    );
  }
}
