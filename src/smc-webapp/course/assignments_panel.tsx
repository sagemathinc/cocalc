/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// CoCalc libraries
const misc = require("smc-util/misc");
const { webapp_client } = require("../webapp_client");

// React libraries
import {
  Component,
  React,
  rclass,
  rtypes,
  redux,
  AppRedux
} from "../app-framework";
const {
  Alert,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Checkbox,
  Row,
  Col,
  Panel
} = require("react-bootstrap");
import { Set, Map } from "immutable";

// CoCalc and course components
import * as util from "./util";
import * as styles from "./styles";
import {
  StudentRecord,
  AssignmentRecord,
  SortDescription,
  CourseStore,
  IsGradingMap
} from "./store";
import { CourseActions } from "./actions";
import { ReactElement } from "react";
const {
  DateTimePicker,
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  Space,
  Tip,
  NumberInput,
  CheckedIcon
} = require("../r_misc");
const { STEPS, step_direction, step_verb, step_ready } = util;
import {
  BigTime,
  FoldersToolbar,
  StudentAssignmentInfo,
  StudentAssignmentInfoHeader
} from "./common";
const { GradingStudentAssignment } = require("./grading/main");
const { GradingStudentAssignmentHeader } = require("./grading/header");
const { Grading } = require("./grading/models");
const { AssignmentNote } = require("./assignment_note");
const { ConfigureGrading } = require("./grading/configure_grading");

const { Progress } = require("./progress");
//import { Progress } from "./progress";
const { SkipCopy } = require("./skip");
//import { SkipCopy } from "./skip";

interface AssignmentsPanelReactProps {
  name: string;
  project_id: string;
  redux: AppRedux;
  actions: object;
  all_assignments: Map<string, AssignmentRecord>;
  students: Map<string, StudentRecord>;
  user_map: object;
  path: string;
  expand_grading_config: any;
}

interface AssignmentsPanelReduxProps {
  expanded_assignments: Set<string>;
  active_assignment_sort: SortDescription;
  active_student_sort: SortDescription;
  expanded_peer_configs: Set<string>;
  active_feedback_edits: IsGradingMap;
  expanded_grading_configs: Set<any>;
  grading: typeof Grading;
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
        show_deleted: false // whether or not to show deleted assignments on the bottom
      };
    }
    displayName: "CourseEditorAssignments";

    static reduxProps = ({ name }) => {
      return {
        [name]: {
          expanded_assignments: rtypes.immutable.Set,
          active_assignment_sort: rtypes.immutable.Map,
          active_student_sort: rtypes.immutable.Map,
          expanded_peer_configs: rtypes.immutable.Set,
          active_feedback_edits: rtypes.immutable.Map,
          expanded_grading_configs: rtypes.immutable.Set,
          grading: rtypes.instanceOf(Grading)
        }
      };
    };

    get_actions(): CourseActions {
      return redux.getActions(this.props.name);
    }

    get_assignment(id: string): AssignmentRecord {
      let assignment = this.props.all_assignments.get(id);
      if (assignment == undefined) {
        console.warn(`Tried to access undefined assignment ${id}`);
      }
      return assignment as any;
    }

    compute_assignment_list() {
      let deleted, f, num_deleted, num_omitted;
      let list = util.immutable_to_list(
        this.props.all_assignments,
        "assignment_id"
      );

      ({ list, num_omitted } = util.compute_match_list({
        list,
        search_key: "path",
        search: this.state.search.trim()
      }));

      if (this.props.active_assignment_sort.get("column_name") === "due_date") {
        f = a => [
          a.due_date != null ? a.due_date : 0,
          a.path != null ? a.path.toLowerCase() : undefined
        ];
      } else if (
        this.props.active_assignment_sort.get("column_name") === "dir_name"
      ) {
        f = a => [
          a.path != null ? a.path.toLowerCase() : undefined,
          a.due_date != null ? a.due_date : 0
        ];
      }

      ({ list, deleted, num_deleted } = util.order_list({
        list,
        compare_function: (a, b) => misc.cmp_array(f(a), f(b)),
        reverse: this.props.active_assignment_sort.get("is_descending"),
        include_deleted: this.state.show_deleted
      }));

      return {
        shown_assignments: list,
        deleted_assignments: deleted,
        num_omitted,
        num_deleted
      };
    }

    render_sort_link(column_name, display_name) {
      return (
        <a
          href=""
          onClick={e => {
            e.preventDefault();
            return this.get_actions().set_active_assignment_sort(column_name);
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
          ) : (
            undefined
          )}
        </a>
      );
    }

    render_assignment_table_header() {
      // HACK: -10px margin gets around ReactBootstrap's incomplete access to styling
      return (
        <Row style={{ marginTop: "-10px", marginBottom: "3px" }}>
          <Col md={6}>
            {this.render_sort_link("dir_name", "Assignment Name")}
          </Col>
          <Col md={6}>{this.render_sort_link("due_date", "Due Date")}</Col>
        </Row>
      );
    }

    render_assignments(assignments) {
      return assignments.map((x, i) => (
        <Assignment
          key={x.assignment_id}
          project_id={this.props.project_id}
          name={this.props.name}
          redux={this.props.redux}
          assignment={this.get_assignment(x.assignment_id)}
          background={i % 2 === 0 ? "#eee" : undefined}
          students={this.props.students}
          user_map={this.props.user_map}
          is_expanded={this.props.expanded_assignments.has(x.assignment_id)}
          active_student_sort={this.props.active_student_sort}
          expand_peer_config={this.props.expanded_peer_configs.has(
            x.assignment_id
          )}
          active_feedback_edits={this.props.active_feedback_edits}
          expand_grading_config={this.props.expanded_grading_configs.has(
            x.assignment_id
          )}
          grading={this.props.grading}
          path={this.props.path}
        />
      ));
    }

    render_show_deleted(num_deleted, num_shown) {
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

    yield_adder(deleted_assignments) {
      const deleted_paths = {};
      deleted_assignments.map(obj => {
        if (obj.path) {
          return (deleted_paths[obj.path] = obj.assignment_id);
        }
      });

      return path => {
        if (deleted_paths[path] != null) {
          return this.get_actions().undelete_assignment(deleted_paths[path]);
        } else {
          return this.get_actions().add_assignment(path);
        }
      };
    }

    render_assignments_main() {
      const {
        shown_assignments,
        deleted_assignments,
        num_omitted,
        num_deleted
      } = this.compute_assignment_list();
      const add_assignment = this.yield_adder(deleted_assignments);

      const header = (
        <FoldersToolbar
          search={this.state.search}
          search_change={value => this.setState({ search: value })}
          num_omitted={num_omitted}
          project_id={this.props.project_id}
          items={this.props.all_assignments}
          add_folders={paths => paths.map(add_assignment)}
          item_name={"assignment"}
          plural_item_name={"assignments"}
        />
      );

      return (
        <Panel header={header}>
          {shown_assignments.length > 0
            ? this.render_assignment_table_header()
            : undefined}
          {this.render_assignments(shown_assignments)}
          {num_deleted
            ? this.render_show_deleted(num_deleted, shown_assignments.length)
            : undefined}
        </Panel>
      );
    }

    render_grading_main() {
      const assignment = this.props.all_assignments.get(
        this.props.grading.assignment_id
      );
      const header = (
        <GradingStudentAssignmentHeader
          redux={this.props.redux}
          name={this.props.name}
          assignment={assignment}
        />
      );
      return (
        <Panel header={header}>
          <GradingStudentAssignment
            redux={this.props.redux}
            name={this.props.name}
            assignment={assignment}
            students={this.props.students}
            user_map={this.props.user_map}
            grading={this.props.grading}
            project_id={this.props.project_id}
          />
          <AssignmentNote
            redux={this.props.redux}
            name={this.props.name}
            assignment={assignment}
          />
        </Panel>
      );
    }

    render() {
      if (this.props.grading != null) {
        return this.render_grading_main();
      } else {
        return this.render_assignments_main();
      }
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
  expand_grading_config: boolean;
  grading: typeof Grading;
  path: string;
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
  displayName: "CourseEditor-Assignment";

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
      copy_confirm_return_graded: false
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
        "grading",
        "expand_grading_config"
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
        <Col xs={1} style={{ marginTop: "8px", color: "#666" }}>
          <Tip
            placement="top"
            title="Set the due date"
            tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment)."
          >
            Due
          </Tip>
        </Col>
        <Col xs={11}>
          <DateTimePicker
            value={this._due_date()}
            on_change={this.date_change}
            autoFocus={false}
            defaultOpen={false}
          />
        </Col>
      </Row>
    );
  }

  date_change = date => {
    if (date == null) {
      date = this._due_date();
    }
    return this.get_actions().set_due_date(
      this.props.assignment,
      date != null ? date.toISOString() : undefined
    );
  };

  render_more_header() {
    let width;
    const status = this.get_store().get_assignment_status(
      this.props.assignment
    );
    if (status == null) {
      return <Loading key="loading_more" />;
    }
    const v: ReactElement<any>[] = [];

    const bottom = {
      borderBottom: "1px solid grey",
      paddingBottom: "10px",
      marginBottom: "10px"
    };
    v.push(
      <Row key="header3" style={bottom}>
        <Col md={2}>{this.render_open_button()}</Col>
        <Col md={10}>
          <Row>
            <Col md={5} style={{ fontSize: "14px" }} key="due">
              {this.render_due()}
            </Col>
            <Col md={7} key="delete">
              <Row>
                <Col md={9} style={{ whiteSpace: "nowrap" }}>
                  {this.render_grading_config_button()}
                  <Space />
                  {this.render_peer_button()}
                </Col>
                <Col md={3}>
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
          <Col md={10} mdOffset={2}>
            {this.render_configure_peer()}
          </Col>
        </Row>
      );
    }
    if (this.state.confirm_delete) {
      v.push(
        <Row key="header2-delete" style={bottom}>
          <Col md={10} mdOffset={2}>
            {this.render_confirm_delete()}
          </Col>
        </Row>
      );
    }

    if (this.props.expand_grading_config) {
      v.push(
        <Row key="header2-grading" style={bottom}>
          <Col md={10} mdOffset={2}>
            <ConfigureGrading
              redux={this.props.redux}
              name={this.props.name}
              assignment={this.props.assignment}
              close={this.toggle_configure_grading}
            />
          </Col>
        </Row>
      );
    }

    const peer = this.is_peer_graded();
    if (peer) {
      width = 2;
    } else {
      width = 3;
    }
    const buttons: ReactElement<any>[] = [];
    const insert_skip_button = () => {
      const b1 = this.render_grading_button(status);
      const b2 = this.render_skip_grading_button(status, true);
      return buttons.push(
        <Col md={width} key={"grading_buttons"}>
          {b1} {b2}
        </Col>
      );
    };

    for (let name of STEPS(peer)) {
      const b = this[`render_${name}_button`](status);
      // squeeze in the skip grading button (don't add it to STEPS!)
      if (!peer && name === "return_graded") {
        insert_skip_button("skip_grading");
      }
      if (b != null) {
        buttons.push(
          <Col md={width} key={name}>
            {b}
          </Col>
        );
        if (peer && name === "peer_collect") {
          insert_skip_button("skip_peer_collect");
        }
      }
    }

    v.push(
      <Row key="header-control">
        <Col md={10} mdOffset={2} key="buttons">
          <Row>{buttons}</Row>
        </Col>
      </Row>
    );

    v.push(
      <Row key="header2-copy">
        <Col md={10} mdOffset={2}>
          {this.render_copy_confirms(status)}
        </Col>
      </Row>
    );

    return v;
  }

  render_more() {
    const header = this.render_more_header();
    const panel_body = (
      <StudentListForAssignment
        redux={this.props.redux}
        name={this.props.name}
        assignment={this.props.assignment}
        students={this.props.students}
        user_map={this.props.user_map}
        active_student_sort={this.props.active_student_sort}
      />
    );
    return (
      <Row key="more">
        <Col sm={12}>
          <Panel header={header} style={{ marginTop: "15px" }}>
            {panel_body}
            <AssignmentNote
              redux={this.props.redux}
              name={this.props.name}
              assignment={this.props.assignment}
            />
          </Panel>;
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
        onClick={() =>
          this.setState({ copy_confirm_assignment: true, copy_confirm: true })
        }
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
      />
    ];
  }

  render_copy_confirms(status) {
    const steps = STEPS(this.is_peer_graded());
    const result: (ReactElement<any> | undefined)[] = [];
    for (let step of steps) {
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
        copy_assignment_confirm_overwrite: false
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
        copy_assignment_confirm_overwrite_text: ""
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
            onChange={e =>
              this.setState({
                copy_assignment_confirm_overwrite_text: e.target.value
              })
            }
            style={{ marginTop: "1ex" }}
          />
        </FormGroup>
        <ButtonToolbar style={{ textAlign: "center", marginTop: "15px" }}>
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
        </ButtonToolbar>
      </div>
    );
  }

  copy_assignment(step, new_only, overwrite?) {
    // assign assignment to all (non-deleted) students
    const actions = this.get_actions();
    switch (step) {
      case "assignment":
        actions.copy_assignment_to_all_students(
          this.props.assignment,
          new_only,
          overwrite
        );
        break;
      case "collect":
        actions.copy_assignment_from_all_students(
          this.props.assignment,
          new_only
        );
        break;
      case "peer_assignment":
        actions.peer_copy_to_all_students(this.props.assignment, new_only);
        break;
      case "peer_collect":
        actions.peer_collect_from_all_students(this.props.assignment, new_only);
        break;
      case "return_graded":
        actions.return_assignment_to_all_students(
          this.props.assignment,
          new_only
        );
        break;
      default:
        console.log(`BUG -- unknown step: ${step}`);
    }
    this.setState({
      [`copy_confirm_${step}`]: false,
      [`copy_confirm_all_${step}`]: false,
      copy_confirm: false
    } as any);
  }

  render_skip(step) {
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

  render_copy_confirm_to_all(step, status) {
    const n = status[`not_${step}`];
    return (
      <Alert
        bsStyle="warning"
        key={`${step}_confirm_to_all`}
        style={{ marginTop: "15px" }}
      >
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this homework{" "}
          {step_direction(step)} the {n} student{n > 1 ? "s" : ""}
          {step_ready(step, n)}?
        </div>
        {this.render_skip(step)}
        <ButtonToolbar>
          <Button
            key="yes"
            bsStyle="primary"
            onClick={() => this.copy_assignment(step, false)}
          >
            Yes
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
      </Alert>
    );
  }

  copy_confirm_all_caution(step) {
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
            </a>.
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

  render_copy_confirm_overwrite_all(step) {
    return (
      <div key={"copy_confirm_overwrite_all"} style={{ marginTop: "15px" }}>
        <div style={{ marginBottom: "15px" }}>
          {this.copy_confirm_all_caution(step)}
        </div>
        <ButtonToolbar>
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
          ) : (
            undefined
          )}
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
        {this.render_copy_assignment_confirm_overwrite(step)}
      </div>
    );
  }

  render_copy_confirm_to_all_or_new(step, status) {
    const n = status[`not_${step}`];
    const m = n + status[step];
    return (
      <Alert
        bsStyle="warning"
        key={`${step}_confirm_to_all_or_new`}
        style={{ marginTop: "15px" }}
      >
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this homework{" "}
          {step_direction(step)}...
        </div>
        {this.render_skip(step)}
        <ButtonToolbar>
          <Button
            key="all"
            bsStyle="danger"
            onClick={() =>
              this.setState({
                [`copy_confirm_all_${step}`]: true,
                copy_confirm: true
              } as any)
            }
            disabled={this.state[`copy_confirm_all_${step}`]}
          >
            {step === "assignment" ? "All" : "The"} {m} students{step_ready(
              step,
              m
            )}...
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
          ) : (
            undefined
          )}
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
        {this.state[`copy_confirm_all_${step}`]
          ? this.render_copy_confirm_overwrite_all(step)
          : undefined}
      </Alert>
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
      />
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
            copy_confirm: true
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
      />
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
      />
    ];
  }

  return_assignment = () => {
    // Assign assignment to all (non-deleted) students.
    return this.get_actions().return_assignment_to_all_students(
      this.props.assignment
    );
  };

  toggle_skip_grading = () => {
    return this.get_actions().set_skip(
      this.props.assignment,
      "grading",
      !this.props.assignment.get("skip_grading")
    );
  };

  render_skip_grading_button(status, float_right: boolean) {
    let icon, left, props;
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    const is_skip_grading =
      (left = this.props.assignment.get("skip_grading")) != null ? left : false;
    if (is_skip_grading) {
      icon = "check-square-o";
    } else {
      icon = "square-o";
    }
    if (float_right) {
      props = { style: { float: "right" } };
    }
    return (
      <Button onClick={this.toggle_skip_grading} {...props}>
        <Icon name={icon} /> Skip
      </Button>
    );
  }

  render_grading_button(status) {
    let activity, bsStyle, left;
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    if (
      (left = this.props.assignment.get("skip_grading")) != null ? left : false
    ) {
      return null;
    }
    // Have already collected something
    let disabled = false;
    let icon = "play";
    let handler = () => {
      // student_id is set to null on purpose (starts fresh)
      return this.get_actions().grading({ assignment: this.props.assignment });
    };
    if (status.graded > 0) {
      if (status.not_graded === 0) {
        disabled = true;
        bsStyle = "success";
        activity = "Done";
        icon = "check-circle";
        handler = function() {};
      } else {
        bsStyle = "primary";
        activity = "Continue";
      }
    } else {
      bsStyle = "primary";
      activity = "Start";
    }
    return (
      <Tip
        title={"Open grading dialog"}
        tip={
          "Go through the collected files of your students, assign points, and grade them."
        }
        placement={"bottom"}
      >
        <Button onClick={handler} bsStyle={bsStyle} disabled={disabled}>
          <Icon name={icon} />
          <span className={"hidden-lg"}> {activity}</span> Grading…
        </Button>
      </Tip>
    );
  }

  render_return_graded_button(status) {
    let bsStyle, left;
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    if (status.peer_collect != null && status.peer_collect === 0) {
      // Peer grading enabled, but we didn't collect anything yet
      return;
    }
    const skip_grading =
      (left = this.props.assignment.get("skip_grading")) != null ? left : false;
    if (
      !skip_grading &&
      (status.not_return_graded === 0 && status.return_graded === 0)
    ) {
      // Nothing unreturned and ungraded yet and also nothing returned yet
      return;
    }
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
            copy_confirm: true
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
      />
    ];
  }

  delete_assignment = () => {
    this.get_actions().delete_assignment(this.props.assignment);
    return this.setState({ confirm_delete: false });
  };

  undelete_assignment = () => {
    return this.get_actions().undelete_assignment(this.props.assignment);
  };

  render_confirm_delete() {
    return (
      <Alert bsStyle="warning" key="confirm_delete">
        Are you sure you want to delete this assignment (you can undelete it
        later)?
        <br /> <br />
        <ButtonToolbar>
          <Button key="yes" onClick={this.delete_assignment} bsStyle="danger">
            <Icon name="trash" /> Delete
          </Button>
          <Button
            key="no"
            onClick={() => this.setState({ confirm_delete: false })}
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </Alert>
    );
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

  set_peer_grade = config => {
    return this.get_actions().set_peer_grade(this.props.assignment, config);
  };

  render_configure_peer_checkbox(config) {
    return (
      <div>
        <Checkbox
          checked={config.enabled != null ? config.enabled : false}
          key="peer_grade_checkbox"
          ref="peer_grade_checkbox"
          onChange={e => this.set_peer_grade({ enabled: e.target.checked })}
          style={{ display: "inline-block", verticalAlign: "middle" }}
        />
        Enable Peer Grading
      </div>
    );
  }

  _peer_due(date): Date | undefined {
    if (date == null) {
      date = this.props.assignment.getIn(["peer_grade", "due_date"]);
    }
    if (date != null) {
      return new Date(date);
    } else {
      return misc.server_days_ago(-7);
    }
  }

  peer_due_change = date => {
    let due_date = this._peer_due(date);
    let due_date_string: string | undefined;
    if (due_date != undefined) {
      due_date_string = due_date.toISOString();
    }
    return this.set_peer_grade({
      due_date: due_date_string
    });
  };

  render_configure_peer_due(config) {
    const label = (
      <Tip
        placement="top"
        title="Set the due date"
        tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading."
      >
        Due
      </Tip>
    );
    return (
      <LabeledRow label_cols={6} label={label}>
        <DateTimePicker
          value={this._peer_due(config.due_date)}
          on_change={this.peer_due_change}
          autoFocus={false}
          defaultOpen={false}
        />
      </LabeledRow>
    );
  }

  render_configure_peer_number(config) {
    let left;
    const store = this.get_store();
    return (
      <LabeledRow
        label_cols={6}
        label="Number of students who will grade each assignment"
      >
        <NumberInput
          on_change={n => this.set_peer_grade({ number: n })}
          min={1}
          max={
            ((left = store != null ? store.num_students() : undefined) != null
              ? left
              : 2) - 1
          }
          number={config.number != null ? config.number : 1}
        />
      </LabeledRow>
    );
  }

  render_configure_grading_guidelines(config) {
    return (
      <div style={{ marginTop: "10px" }}>
        <LabeledRow
          label_cols={6}
          label="Grading guidelines, which will be made available to students in their grading folder in a file GRADING_GUIDE.md.  Tell your students how to grade each problem.  Since this is a markdown file, you might also provide a link to a publicly shared file or directory with guidelines."
        >
          <div
            style={{
              background: "white",
              padding: "10px",
              border: "1px solid #ccc",
              borderRadius: "3px"
            }}
          >
            <MarkdownInput
              persist_id={
                this.props.assignment.get("path") +
                this.props.assignment.get("assignment_id") +
                "grading-guidelines"
              }
              attach_to={this.props.name}
              rows={16}
              placeholder="Enter your grading guidelines for this assignment..."
              default_value={config.guidelines}
              on_save={x => this.set_peer_grade({ guidelines: x })}
            />
          </div>
        </LabeledRow>
      </div>
    );
  }

  render_configure_peer() {
    const peer_info = this.props.assignment.get("peer_grade");
    let config: { enabled?: boolean } = {};
    if (peer_info) {
      config = peer_info.toJS();
    }
    return (
      <Alert bsStyle="warning">
        <h3>
          <Icon name="users" /> Peer grading
        </h3>

        <div style={{ color: "#666" }}>
          Use peer grading to randomly (and anonymously) redistribute collected
          homework to your students, so that they can grade it for you.
        </div>

        {this.render_configure_peer_checkbox(config)}
        {config.enabled ? this.render_configure_peer_number(config) : undefined}
        {config.enabled ? this.render_configure_peer_due(config) : undefined}
        {config.enabled
          ? this.render_configure_grading_guidelines(config)
          : undefined}

        <Button
          onClick={() =>
            this.get_actions().toggle_item_expansion(
              "peer_config",
              this.props.assignment.get("assignment_id")
            )
          }
        >
          Close
        </Button>
      </Alert>
    );
  }

  render_peer_button() {
    const icon = (
      <CheckedIcon
        checked={__guard__(this.props.assignment.get("peer_grade"), x =>
          x.get("enabled")
        )}
      />
    );
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
        {icon} Peer Grading...
      </Button>
    );
  }

  toggle_configure_grading() {
    const aid = this.props.assignment.get("assignment_id");
    return this.get_actions().toggle_item_expansion("grading_config", aid);
  }

  render_grading_config_button() {
    return (
      <Button
        disabled={this.props.expand_grading_config}
        onClick={this.toggle_configure_grading}
      >
        <Icon name={"gavel"} /> Configure Grading...
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
        onClick={e => {
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
        <Col md={6}>
          <h5>{this.render_assignment_title_link()}</h5>
        </Col>
        <Col md={6}>{this.render_summary_due_date()}</Col>
      </Row>
    );
  }

  render() {
    return (
      <Row
        style={
          this.props.is_expanded ? styles.selected_entry : styles.entry_style
        }
      >
        <Col xs={12}>
          {this.render_summary_line()}
          {this.props.is_expanded ? this.render_more() : undefined}
        </Col>
      </Row>
    );
  }
}

interface StudentListForAssignmentProps {
  name: string;
  redux: AppRedux;
  assignment: AssignmentRecord;
  students: any;
  user_map: any;
  background?: string;
  active_student_sort: SortDescription;
  active_feedback_edits: IsGradingMap;
}

interface StudentListForAssignmentState {}

class StudentListForAssignment extends Component<
  StudentListForAssignmentProps,
  StudentListForAssignmentState
> {
  displayName: "CourseEditor-StudentListForAssignment";

  shouldComponentUpdate(props) {
    return misc.is_different(this.props, props, [
      "assignment",
      "students",
      "user_map",
      "background",
      "active_student_sort",
      "active_feedback_edits"
    ]);
  }

  get_store(): CourseStore {
    return redux.getStore(this.props.name) as any;
  }

  is_peer_graded() {
    const peer_info = this.props.assignment.get("peer_grade");
    return peer_info ? peer_info.get("enabled") : false;
  }

  render_student_info(student_id) {
    const store = this.get_store();
    const student = store.get_student(student_id);
    const key = util.assignment_identifier(this.props.assignment, student);
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
        student={student_id}
        assignment={this.props.assignment}
        grade={store.get_grade(this.props.assignment, student_id)}
        points={store.get_points_total(this.props.assignment, student_id)}
        edit_points={true}
        comments={store.get_comments(this.props.assignment, student_id)}
        info={store.student_assignment_info(student_id, this.props.assignment)}
        grading_mode={store.get_grading_mode(this.props.assignment)}
        total_points={store.get_points_total(this.props.assignment, student_id)}
        max_points={store.get_grading_maxpoints(this.props.assignment)}
      />
    );
  }

  render_students() {
    let x;
    let v = util.parse_students(
      this.props.students,
      this.props.user_map,
      this.props.redux
    );
    // fill in names, for use in sorting and searching (TODO: caching)
    v = (() => {
      const result: any[] = [];
      for (x of v) {
        if (!x.deleted) {
          result.push(x);
        }
      }
      return result;
    })();
    v.sort(util.pick_student_sorter(this.props.active_student_sort.toJS()));
    if (this.props.active_student_sort.get("is_descending")) {
      v.reverse();
    }

    return (() => {
      const result1: any[] = [];
      for (x of v) {
        result1.push(this.render_student_info(x.student_id));
      }
      return result1;
    })();
  }

  render() {
    return (
      <div>
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
