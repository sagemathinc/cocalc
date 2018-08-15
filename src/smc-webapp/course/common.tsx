/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// CoCalc libraries
const misc = require("smc-util/misc");
const { defaults, required } = misc;
const { COLORS } = require("smc-util/theme");

// React libraries
import { React, Fragment, Component } from "../app-framework";
import { CourseActions } from "./actions";
import { redux } from "../frame-editors/generic/test/util";
import { AssignmentRecord, StudentRecord } from "./store";
import { FormEvent, CSSProperties } from "react";

const {
  Button,
  ButtonToolbar,
  ButtonGroup,
  FormControl,
  FormGroup,
  Row,
  Col
} = require("react-bootstrap");

const {
  ErrorDisplay,
  Icon,
  MarkdownInput,
  TimeAgo,
  Tip,
  is_different_date
} = require("../r_misc");

export let { FoldersToolbar } = require("./common/FoldersToolBar");

export function RedCross() {
  return (
    <span style={{ color: COLORS.BS_RED }}>
      <Icon name={"times-circle"} />
    </span>
  );
}

export function GreenCheckmark() {
  return (
    <span style={{ color: COLORS.BS_GREEN_DD }}>
      <Icon name={"check-circle"} />
    </span>
  );
}

interface BigTimeProps {
  date: string | number | object;
}

export class BigTime extends Component<BigTimeProps> {
  displayName: "CourseEditor-BigTime";

  shouldComponentUpdate(props) {
    return is_different_date(this.props.date, props.date);
  }

  render() {
    let { date } = this.props;
    if (date == null) {
      return;
    }
    if (typeof date === "string") {
      date = misc.ISO_to_Date(date);
    }
    return <TimeAgo popover={true} date={date} />;
  }
}

interface StudentAssignmentInfoHeaderProps {
  title: string;
  peer_grade?: boolean;
}

export class StudentAssignmentInfoHeader extends Component<
  StudentAssignmentInfoHeaderProps
> {
  displayName: "CourseEditor-StudentAssignmentInfoHeader";

  render_col(number, key, width) {
    let tip, title;
    switch (key) {
      case "last_assignment":
        title = "Assign to Student";
        tip =
          "This column gives the status of making homework available to students, and lets you copy homework to one student at a time.";
        break;
      case "collect":
        title = "Collect from Student";
        tip =
          "This column gives status information about collecting homework from students, and lets you collect from one student at a time.";
        break;
      case "grade":
        title = "Grade";
        tip =
          'Record homework grade" tip="Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Configuration tab.';
        break;

      case "peer-assign":
        title = "Assign Peer Grading";
        tip =
          "This column gives the status of sending out collected homework to students for peer grading.";
        break;

      case "peer-collect":
        title = "Collect Peer Grading";
        tip =
          "This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.";
        break;

      case "return_graded":
        title = "Return to Student";
        tip =
          "This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.";
        break;
    }
    return (
      <Col md={width} key={key}>
        <Tip title={title} tip={tip}>
          <b>
            {number}. {title}
          </b>
        </Tip>
      </Col>
    );
  }

  render_headers() {
    const w = 3;
    return (
      <Row>
        {this.render_col(1, "last_assignment", w)}
        {this.render_col(2, "collect", w)}
        {this.render_col(3, "grade", w)}
        {this.render_col(4, "return_graded", w)}
      </Row>
    );
  }

  render_headers_peer() {
    const w = 2;
    return (
      <Row>
        {this.render_col(1, "last_assignment", w)}
        {this.render_col(2, "collect", w)}
        {this.render_col(3, "peer-assign", w)}
        {this.render_col(4, "peer-collect", w)}
        {this.render_col(5, "grade", w)}
        {this.render_col(6, "return_graded", w)}
      </Row>
    );
  }

  render() {
    return (
      <Row style={{ borderBottom: "2px solid #aaa" }}>
        <Col md={2} key="title">
          <Tip
            title={this.props.title}
            tip={
              this.props.title === "Assignment"
                ? "This column gives the directory name of the assignment."
                : "This column gives the name of the student."
            }
          >
            <b>{this.props.title}</b>
          </Tip>
        </Col>
        <Col md={10} key="rest">
          {this.props.peer_grade
            ? this.render_headers_peer()
            : this.render_headers()}
        </Col>
      </Row>
    );
  }
}

interface StudentAssignmentInfoProps {
  name: string;
  title: string | object;
  student: StudentRecord;
  assignment: AssignmentRecord;
  grade?: string;
  comments?: string;
  info: {
    assignment_id: string;
    student_id: string;
    peer_assignment: boolean;
    peer_collect: boolean;
    last_assignment: { error: string };
    last_collect: { error: string };
    last_peer_assignment: number;
    last_peer_collect: { error: string };
    last_return_graded: { error: string };
  };
  edited_grade?: string;
  edited_comments?: string;
  is_editing: boolean;
  peer_grade_layout: boolean;
  points?: number;
  edit_points?: boolean;
  grading_mode: string;
  total_points: number;
  max_points: number;
}

interface StudentAssignmentInfoState {
  recopy_name: boolean;
  recopy_open: boolean;
  recopy_copy: boolean;
  recopy_copy_tip: boolean;
  recopy_open_tip: boolean;
  recopy_placement: boolean;
}

export class StudentAssignmentInfo extends Component<
  StudentAssignmentInfoProps,
  StudentAssignmentInfoState
> {
  displayName: "CourseEditor-StudentAssignmentInfo";

  constructor(props: StudentAssignmentInfoProps) {
    super(props);
    this.state = {
      recopy_name: false,
      recopy_open: false,
      recopy_copy: false,
      recopy_copy_tip: false,
      recopy_open_tip: false,
      recopy_placement: false
    };
  }

  static defaultProps = {
    grade: "",
    comments: "",
    eer_grade_layout: false
  };

  get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  open = (type, assignment_id, student_id) => {
    return this.get_actions().open_assignment(type, assignment_id, student_id);
  };

  copy = (type, assignment_id, student_id) => {
    return this.get_actions().copy_assignment(type, assignment_id, student_id);
  };

  stop = (type, assignment_id, student_id) => {
    return this.get_actions().stop_copying_assignment(
      type,
      assignment_id,
      student_id
    );
  };

  save_feedback = (e?: FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault;
    }
    this.get_actions().save_feedback(this.props.assignment, this.props.student);
  };

  set_edited_feedback = (grade?: string, comments?: string) => {
    this.get_actions().update_edited_feedback(
      this.props.assignment,
      this.props.student,
      grade,
      comments
    );
  };

  edit_points = () => {
    const student_id =
      typeof this.props.student !== "string"
        ? this.props.student.get("student_id")
        : this.props.student;
    this.get_actions().grading({
      assignment: this.props.assignment,
      student_id,
      direction: 0
    });
  };

  handle_grade_change = e => {
    e.preventDefault();
    this.set_edited_feedback(e.target.value);
  };

  handle_comments_change = value => {
    this.set_edited_feedback(undefined, value);
  };

  cancel_editing = () => {
    this.get_actions().clear_edited_feedback(
      this.props.assignment,
      this.props.student
    );
  };

  render_grade_manual() {
    if (this.props.is_editing) {
      return (
        <form
          key="grade"
          onSubmit={this.save_feedback}
          style={{ marginTop: "15px" }}
        >
          <FormGroup>
            <FormControl
              autoFocus={true}
              value={this.props.edited_grade}
              ref="grade_input"
              type="text"
              placeholder="Grade (any text)..."
              onChange={this.handle_grade_change}
              onKeyDown={this.on_key_down_grade_editor}
            />
          </FormGroup>
        </form>
      );
    } else {
      if (this.props.grade) {
        return (
          <div key="grade">
            <strong>Grade</strong>: {this.props.grade}
            <br />
            {this.props.comments ? (
              <span>
                <strong>Comments</strong>:
              </span>
            ) : (
              undefined
            )}
          </div>
        );
      }
    }
  }

  render_comments(edit_button_text) {
    const rendered_style = {
      maxHeight: "4em",
      overflowY: "auto",
      padding: "5px",
      border: "1px solid #888"
    };

    return (
      <MarkdownInput
        autoFocus={false}
        editing={this.props.is_editing}
        hide_edit_button={
          !(
            (typeof edit_button_text !== "undefined" &&
            edit_button_text !== null
              ? edit_button_text.length
              : undefined) > 0
          )
        }
        save_disabled={
          this.props.edited_grade === this.props.grade &&
          this.props.edited_comments === this.props.comments
        }
        rows={5}
        placeholder="Comments (optional)"
        default_value={this.props.edited_comments || this.props.comments}
        on_edit={() => this.set_edited_feedback()}
        on_change={this.handle_comments_change}
        on_save={() => this.save_feedback()}
        on_cancel={this.cancel_editing}
        rendered_style={rendered_style}
        edit_button_bsSize={"small"}
      />
    );
  }

  on_key_down_grade_editor = e => {
    switch (e.keyCode) {
      case 27:
        this.cancel_editing();
        break;
      case 13:
        if (e.shiftKey) {
          return this.save_feedback();
        }
        break;
    }
  };
  render_edit_points() {
    const style: CSSProperties = { float: "right", color: COLORS.GRAY };
    const points = `${misc.round2(
      this.props.points != null ? this.props.points : 0
    )} ${misc.plural(this.props.points, "pt")}.`;
    if (this.props.edit_points) {
      return (
        <Tip
          title={"Points for this collected assignment"}
          tip={
            "Click to show the grading points edtior for the collected assignment of this student."
          }
        >
          <Button style={style} onClick={this.edit_points} bsStyle={"default"}>
            {points}
          </Button>
        </Tip>
      );
    } else {
      return <span style={style}>{points}</span>;
    }
  }
  render_grade_col_manual() {
    let grade = this.props.grade || "";
    const bsStyle = !grade.trim() ? "primary" : undefined;
    const text = grade.trim() ? "Edit grade" : "Enter grade";

    return (
      <Fragment>
        <Tip
          title="Enter student's grade"
          tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number)."
        >
          <Button
            key="edit"
            onClick={() => this.set_edited_feedback()}
            bsStyle={bsStyle}
          >
            {text}
          </Button>
        </Tip>
        {this.render_edit_points()}
        {this.render_grade_manual()}
      </Fragment>
    );
  }

  render_grade_col_points() {
    let edit_button_text, grade_text;
    const { grade2str } = require("./grading/common");
    const grade_points = grade2str(
      this.props.total_points,
      this.props.max_points
    );
    const grade_confirmed = grade_points === this.props.grade;
    if (grade_confirmed) {
      grade_text = this.props.grade;
    } else {
      grade_text = "(unconfirmed)";
    }
    if (!this.props.comments) {
      edit_button_text = "Add comment…";
    }
    return (
      <Fragment>
        {this.render_edit_points()}
        <div key="grade">
          {!grade_confirmed ? (
            <Fragment>
              <RedCross />{" "}
            </Fragment>
          ) : (
            undefined
          )}
          <strong>Grade</strong>: {grade_text}
          <br />
          {this.props.comments ? (
            <span>
              <strong>Comments</strong>:
            </span>
          ) : (
            undefined
          )}
        </div>
        {this.render_comments(edit_button_text)}
      </Fragment>
    );
  }

  render_grade_col() {
    switch (this.props.grading_mode) {
      case "manual":
        return this.render_grade_col_manual();
      case "points":
        return this.render_grade_col_points();
    }
  }

  render_last_time(time) {
    return (
      <div key="time" style={{ color: "#666" }}>
        (<BigTime date={time} />)
      </div>
    );
  }

  render_open_recopy_confirm(name, copy, copy_tip, placement) {
    const key = `recopy_${name}`;
    if (this.state[key]) {
      const v: any[] = [];
      v.push(
        <Button
          key="copy_confirm"
          bsStyle="danger"
          onClick={() => {
            this.setState({ [key]: false } as any);
            return copy();
          }}
        >
          <Icon
            name="share-square-o"
            rotate={name.indexOf("ollect") !== -1 ? "180" : undefined}
          />{" "}
          Yes, {name.toLowerCase()} again
        </Button>
      );
      v.push(
        <Button
          key="copy_cancel"
          onClick={() => this.setState({ [key]: false } as any)}
        >
          Cancel
        </Button>
      );
      if (name.toLowerCase() === "assign") {
        // inline-block because buttons above are float:left
        v.push(
          <div style={{ margin: "5px", display: "inline-block" }}>
            <a
              target="_blank"
              href="https://github.com/sagemathinc/cocalc/wiki/CourseCopy"
            >
              What happens when I assign again?
            </a>
          </div>
        );
      }
      return v;
    } else {
      return (
        <Button
          key="copy"
          bsStyle="warning"
          onClick={() => this.setState({ [key]: true } as any)}
        >
          <Tip title={name} placement={placement} tip={<span>{copy_tip}</span>}>
            <Icon
              name="share-square-o"
              rotate={name.indexOf("ollect") !== -1 ? "180" : undefined}
            />{" "}
            {name}...
          </Tip>
        </Button>
      );
    }
  }

  render_open_recopy(name, open, copy, copy_tip, open_tip) {
    const placement = name === "Return" ? "left" : "right";
    return (
      <ButtonToolbar key="open_recopy">
        {this.render_open_recopy_confirm(name, copy, copy_tip, placement)}
        <Button key="open" onClick={open}>
          <Tip title="Open assignment" placement={placement} tip={open_tip}>
            <Icon name="folder-open-o" /> Open
          </Tip>
        </Button>
      </ButtonToolbar>
    );
  }

  render_open_copying(name, open, stop) {
    return (
      <ButtonGroup key="open_copying">
        <Button key="copy" bsStyle="success" disabled={true}>
          <Icon name="cc-icon-cocalc-ring" spin /> {name}ing
        </Button>
        <Button key="stop" bsStyle="danger" onClick={stop}>
          <Icon name="times" />
        </Button>
        <Button key="open" onClick={open}>
          <Icon name="folder-open-o" /> Open
        </Button>
      </ButtonGroup>
    );
  }

  render_copy(name, copy, copy_tip) {
    let placement;
    if (name === "Return") {
      placement = "left";
    }
    return (
      <Tip key="copy" title={name} tip={copy_tip} placement={placement}>
        <Button onClick={copy} bsStyle={"primary"}>
          <Icon
            name="share-square-o"
            rotate={name.indexOf("ollect") !== -1 ? "180" : undefined}
          />{" "}
          {name}
        </Button>
      </Tip>
    );
  }

  render_error(name, error) {
    if (typeof error !== "string") {
      error = misc.to_json(error);
    }
    if (error.indexOf("No such file or directory") !== -1) {
      error = `Somebody may have moved the folder that should have contained the assignment.\n${error}`;
    } else {
      error = `Try to ${name.toLowerCase()} again:\n` + error;
    }
    return (
      <ErrorDisplay
        key="error"
        error={error}
        style={{ maxHeight: "140px", overflow: "auto" }}
      />
    );
  }

  render_last(opts) {
    opts = defaults(opts, {
      name: required,
      type: required,
      data: {},
      enable_copy: false,
      copy_tip: "",
      open_tip: "",
      omit_errors: false
    });

    const open = () =>
      this.open(
        opts.type,
        this.props.info.assignment_id,
        this.props.info.student_id
      );
    const copy = () =>
      this.copy(
        opts.type,
        this.props.info.assignment_id,
        this.props.info.student_id
      );
    const stop = () =>
      this.stop(
        opts.type,
        this.props.info.assignment_id,
        this.props.info.student_id
      );
    const v: any[] = [];
    if (opts.enable_copy) {
      if (opts.data.start) {
        v.push(this.render_open_copying(opts.name, open, stop));
      } else if (opts.data.time) {
        v.push(
          this.render_open_recopy(
            opts.name,
            open,
            copy,
            opts.copy_tip,
            opts.open_tip
          )
        );
      } else {
        v.push(this.render_copy(opts.name, copy, opts.copy_tip));
      }
    }
    if (opts.data.time) {
      v.push(this.render_last_time(opts.data.time));
    }
    if (opts.data.error && !opts.omit_errors) {
      v.push(this.render_error(opts.name, opts.data.error));
    }
    return v;
  }

  render_peer_assign() {
    return (
      <Col md={2} key="peer_assign">
        {this.render_last({
          name: "Peer Assign",
          data: this.props.info.last_peer_assignment,
          type: "peer-assigned",
          enable_copy: this.props.info.last_collect != null,
          copy_tip:
            "Copy collected assignments from your project to this student's project so they can grade them.",
          open_tip:
            "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading."
        })}
      </Col>
    );
  }

  render_peer_collect() {
    return (
      <Col md={2} key="peer_collect">
        {this.render_last({
          name: "Peer Collect",
          data: this.props.info.last_peer_collect,
          type: "peer-collected",
          enable_copy: this.props.info.last_peer_assignment != null,
          copy_tip:
            "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
          open_tip:
            "Open your copy of your student's peer grading work in your own project, so that you can grade their work."
        })}
      </Col>
    );
  }

  render_empty_peer_col(which) {
    return (
      <Col md={2} key={`peer-${which}}`}>
        <Row />
      </Col>
    );
  }

  render() {
    let left, show_grade_col, show_return_graded;
    const peer_grade = __guard__(this.props.assignment.get("peer_grade"), x =>
      x.get("enabled")
    );
    const skip_grading =
      (left = this.props.assignment.get("skip_grading")) != null ? left : false;
    const skip_assignment = this.props.assignment.get("skip_assignment");
    const skip_collect = this.props.assignment.get("skip_collect");
    if (peer_grade) {
      show_grade_col =
        !skip_grading &&
        this.props.info.last_peer_collect &&
        !this.props.info.last_peer_collect.error;
      show_return_graded =
        this.props.grade ||
        (skip_grading &&
          this.props.info.last_peer_collect &&
          !this.props.info.last_peer_collect.error);
    } else {
      show_grade_col =
        (!skip_grading &&
          this.props.info.last_collect &&
          !this.props.info.last_collect.error) ||
        skip_collect;
      show_return_graded =
        this.props.grade ||
        (skip_grading &&
          this.props.info.last_collect &&
          !this.props.info.last_collect.error) ||
        (skip_grading && skip_collect);
    }

    const width = peer_grade || this.props.peer_grade_layout ? 2 : 3;
    return (
      <Row
        style={{
          borderTop: "1px solid #aaa",
          paddingTop: "5px",
          paddingBottom: "5px"
        }}
      >
        <Col md={2} key="title">
          {this.props.title}
        </Col>
        <Col md={10} key="rest">
          <Row>
            <Col md={width} key="last_assignment">
              {this.render_last({
                name: "Assign",
                data: this.props.info.last_assignment,
                type: "assigned",
                enable_copy: true,
                copy_tip:
                  "Copy the assignment from your project to this student's project so they can do their homework.",
                open_tip:
                  "Open the student's copy of this assignment directly in their project. " +
                  "You will be able to see them type, chat with them, leave them hints, etc.",
                omit_errors: skip_assignment
              })}
            </Col>
            <Col md={width} key="last_collect">
              {skip_assignment ||
              !(this.props.info.last_assignment != null
                ? this.props.info.last_assignment.error
                : undefined)
                ? this.render_last({
                    name: "Collect",
                    data: this.props.info.last_collect,
                    type: "collected",
                    enable_copy:
                      this.props.info.last_assignment != null ||
                      skip_assignment,
                    copy_tip:
                      "Copy the assignment from your student's project back to your project so you can grade their work.",
                    open_tip:
                      "Open the copy of your student's work in your own project, so that you can grade their work.",
                    omit_errors: skip_collect
                  })
                : undefined}
            </Col>
            {peer_grade &&
            this.props.info.peer_assignment &&
            !(this.props.info.last_collect != null
              ? this.props.info.last_collect.error
              : undefined)
              ? this.render_peer_assign()
              : undefined}
            {peer_grade && this.props.info.peer_collect
              ? this.render_peer_collect()
              : undefined}
            {!peer_grade && this.props.peer_grade_layout
              ? this.render_empty_peer_col("assign")
              : undefined}
            {!peer_grade && this.props.peer_grade_layout
              ? this.render_empty_peer_col("collect")
              : undefined}
            <Col md={width} key="grade">
              {show_grade_col ? this.render_grade_col() : undefined}
            </Col>
            <Col md={width} key="return_graded">
              {show_return_graded
                ? this.render_last({
                    name: "Return",
                    data: this.props.info.last_return_graded,
                    type: "graded",
                    enable_copy:
                      this.props.info.last_collect != null || skip_collect,
                    copy_tip:
                      "Copy the graded assignment back to your student's project.",
                    open_tip:
                      "Open the copy of your student's work that you returned to them. " +
                      "This opens the returned assignment directly in their project."
                  })
                : undefined}
            </Col>
          </Row>
        </Col>
      </Row>
    );
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
