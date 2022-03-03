/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { MarkdownInput } from "@cocalc/frontend/editors/markdown-input";
import { redux } from "@cocalc/frontend/frame-editors/generic/test/util";
import { NotebookScores } from "@cocalc/frontend/jupyter/nbgrader/autograde";
import { defaults, required, to_json } from "@cocalc/util/misc";
import { Col, Row } from "antd";
import { BigTime } from ".";
import {
  ErrorDisplay,
  Icon,
  Markdown,
  Space,
  Tip,
} from "@cocalc/frontend/components";
import { CourseActions } from "../actions";
import { NbgraderScores } from "../nbgrader/scores";
import {
  AssignmentRecord,
  LastCopyInfo,
  NBgraderRunInfo,
  StudentRecord,
} from "../store";
import { AssignmentCopyType } from "../types";

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
    last_assignment?: LastCopyInfo;
    last_collect?: LastCopyInfo;
    last_peer_assignment?: LastCopyInfo;
    last_peer_collect?: LastCopyInfo;
    last_return_graded?: LastCopyInfo;
  };
  nbgrader_scores?: { [ipynb: string]: NotebookScores | string };
  nbgrader_score_ids?: { [ipynb: string]: string[] };
  is_editing: boolean;
  nbgrader_run_info?: NBgraderRunInfo;
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
  private clicked_nbgrader?: Date;
  constructor(props: StudentAssignmentInfoProps) {
    super(props);
    this.state = {
      recopy_name: false,
      recopy_open: false,
      recopy_copy: false,
      recopy_copy_tip: false,
      recopy_open_tip: false,
      recopy_placement: false,
    };
  }

  static defaultProps = {
    grade: "",
    comments: "",
  };

  private get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  private open = (
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string
  ) => {
    return this.get_actions().assignments.open_assignment(
      type,
      assignment_id,
      student_id
    );
  };

  private copy = (
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string
  ) => {
    return this.get_actions().assignments.copy_assignment(
      type,
      assignment_id,
      student_id
    );
  };

  private stop = (
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string
  ) => {
    this.get_actions().assignments.stop_copying_assignment(
      assignment_id,
      student_id,
      type
    );
  };

  private set_edited_feedback = () => {
    this.get_actions().assignments.update_edited_feedback(
      this.props.assignment.get("assignment_id"),
      this.props.student.get("student_id")
    );
  };

  private stop_editing = () => {
    this.get_actions().assignments.clear_edited_feedback(
      this.props.assignment.get("assignment_id"),
      this.props.student.get("student_id")
    );
  };

  private render_grade(): Rendered {
    if (this.props.is_editing) {
      return (
        <MarkdownInput
          placeholder="Grade..."
          value={this.props.grade || ""}
          onBlur={(grade) => {
            this.get_actions().assignments.set_grade(
              this.props.assignment.get("assignment_id"),
              this.props.student.get("student_id"),
              grade
            );
          }}
          onShiftEnter={() => this.stop_editing()}
          height="3em"
          hideHelp
          style={{ margin: "5px 0" }}
          autoFocus
        />
      );
    } else {
      if (this.props.grade) {
        return (
          <div
            style={{ cursor: "pointer" }}
            onClick={() => this.set_edited_feedback()}
            key="grade"
          >
            Grade: {this.props.grade}
          </div>
        );
      }
    }
  }

  private render_comments(): Rendered {
    if (!this.props.is_editing) {
      if (!this.props.comments?.trim()) return;
      return (
        <div style={{ width: "100%", paddingRight: "5px" }}>
          <Markdown
            value={this.props.comments}
            style={{
              width: "100%",
              maxHeight: "4em",
              overflowY: "auto",
              padding: "5px",
              border: "1px solid lightgray",
              cursor: "pointer",
              display: "inline-block",
            }}
            onClick={() => this.set_edited_feedback()}
          />
        </div>
      );
    } else {
      return (
        <MarkdownInput
          placeholder="Optional markdown comments..."
          value={this.props.comments || ""}
          onBlur={(comment) => {
            this.get_actions().assignments.set_comment(
              this.props.assignment.get("assignment_id"),
              this.props.student.get("student_id"),
              comment
            );
          }}
          onShiftEnter={() => this.stop_editing()}
          height="7em"
          hideHelp
        />
      );
    }
  }

  private render_nbgrader_scores(): Rendered {
    if (!this.props.nbgrader_scores) return;
    return (
      <div>
        <NbgraderScores
          show_all={this.props.is_editing}
          set_show_all={() => this.set_edited_feedback()}
          nbgrader_scores={this.props.nbgrader_scores}
          nbgrader_score_ids={this.props.nbgrader_score_ids}
          name={this.props.name}
          student_id={this.props.student.get("student_id")}
          assignment_id={this.props.assignment.get("assignment_id")}
        />
        {this.render_run_nbgrader("Run nbgrader again")}
      </div>
    );
  }

  private render_run_nbgrader(label: string | Rendered): Rendered {
    let running = false;
    if (this.props.nbgrader_run_info != null) {
      const t = this.props.nbgrader_run_info.get(
        this.props.assignment.get("assignment_id") +
          "-" +
          this.props.student.get("student_id")
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
    label = running ? (
      <span>
        {" "}
        <Icon name="cocalc-ring" spin /> Running nbgrader
      </span>
    ) : (
      <span>{label}</span>
    );

    return (
      <div style={{ marginTop: "5px" }}>
        <Button
          key="nbgrader"
          disabled={running}
          onClick={() => {
            if (
              this.clicked_nbgrader != null &&
              new Date().valueOf() - this.clicked_nbgrader.valueOf() <= 3000
            ) {
              // User *just* clicked, and we want to avoid double click
              // running nbgrader twice.
              return;
            }

            this.clicked_nbgrader = new Date();
            this.get_actions().assignments.run_nbgrader_for_one_student(
              this.props.assignment.get("assignment_id"),
              this.props.student.get("student_id")
            );
          }}
        >
          <Icon name="graduation-cap" /> {label}
        </Button>
      </div>
    );
  }

  private render_nbgrader(): Rendered {
    if (this.props.nbgrader_scores) {
      return this.render_nbgrader_scores();
    }
    if (
      !this.props.assignment.get("nbgrader") ||
      this.props.assignment.get("skip_grading")
    )
      return;

    return this.render_run_nbgrader("Run nbgrader");
  }

  private render_enter_grade(): Rendered {
    if ((this.props.grade ?? "").trim() || (this.props.comments ?? "").trim()) {
      return;
    }
    return (
      <Button
        key="edit"
        onClick={() => this.set_edited_feedback()}
        bsStyle={"default"}
        disabled={this.props.is_editing}
        style={{ marginRight: "5px" }}
      >
        Enter grade...
      </Button>
    );
  }

  private render_save_button(): Rendered {
    if (!this.props.is_editing) return;
    return (
      <Button bsStyle="success" key="save" onClick={() => this.stop_editing()}>
        Save
      </Button>
    );
  }

  private render_grade_col(): Rendered {
    return (
      <>
        {this.render_enter_grade()}
        {this.render_save_button()}
        {this.render_grade()}
        {this.render_comments()}
        {this.render_nbgrader()}
      </>
    );
  }

  private render_last_time(time: string | number | Date): Rendered {
    return (
      <div key="time" style={{ color: "#666" }}>
        <BigTime date={time} />
      </div>
    );
  }

  private render_open_recopy_confirm(
    name: string,
    copy: Function,
    copy_tip: string,
    placement
  ): Rendered | Rendered[] {
    const key = `recopy_${name}`;
    if (this.state[key]) {
      const v: Rendered[] = [];
      v.push(
        <Button
          key="recopy_confirm"
          bsStyle="danger"
          onClick={() => {
            this.setState({ [key]: false } as any);
            copy();
          }}
        >
          <Icon
            name="share-square"
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
          <div
            key="what-happens"
            style={{ margin: "5px", display: "inline-block" }}
          >
            <a
              target="_blank"
              href="https://doc.cocalc.com/teaching-tips_and_tricks.html#how-exactly-are-assignments-copied-to-students"
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
              name="share-square"
              rotate={name.indexOf("ollect") !== -1 ? "180" : undefined}
            />{" "}
            {name}...
          </Tip>
        </Button>
      );
    }
  }

  private render_open_recopy(
    name: string,
    open,
    copy,
    copy_tip: string,
    open_tip: string
  ): Rendered {
    const placement = name === "Return" ? "left" : "right";
    return (
      <div key="open_recopy">
        {this.render_open_recopy_confirm(name, copy, copy_tip, placement)}
        <Space />
        <Button key="open" onClick={open}>
          <Tip title="Open assignment" placement={placement} tip={open_tip}>
            <Icon name="folder-open" /> Open
          </Tip>
        </Button>
      </div>
    );
  }

  private render_open_copying(name: string, open, stop): Rendered {
    return (
      <ButtonGroup key="open_copying">
        <Button key="copy" bsStyle="success" disabled={true}>
          <Icon name="cocalc-ring" spin /> {name}ing
        </Button>
        <Button key="stop" bsStyle="danger" onClick={stop}>
          <Icon name="times" />
        </Button>
        <Button key="open" onClick={open}>
          <Icon name="folder-open" /> Open
        </Button>
      </ButtonGroup>
    );
  }

  private render_copy(name: string, copy, copy_tip: string): Rendered {
    let placement;
    if (name === "Return") {
      placement = "left";
    }
    return (
      <Tip key="copy" title={name} tip={copy_tip} placement={placement}>
        <Button onClick={copy} bsStyle={"primary"}>
          <Icon
            name="share-square"
            rotate={name.indexOf("ollect") !== -1 ? "180" : undefined}
          />{" "}
          {name}
        </Button>
      </Tip>
    );
  }

  private render_error(name: string, error): Rendered {
    if (typeof error !== "string") {
      error = to_json(error);
    }
    // We search for two different error messages, since different errors happen in
    // KuCalc versus other places cocalc runs.  It depends on what is doing the copy.
    if (
      error.indexOf("No such file or directory") !== -1 ||
      error.indexOf("ENOENT") != -1
    ) {
      error = `The student might have renamed or deleted the directory that contained their assignment.  Open their project and see what happened.   If they renamed it, you could rename it back, then collect the assignment again.\n${error}`;
    } else {
      error = `Try to ${name.toLowerCase()} again:\n` + error;
    }
    return (
      <ErrorDisplay
        key="error"
        error={error}
        style={{ maxHeight: "140px", overflow: "auto", display: "block" }}
      />
    );
  }

  private render_last(opts: {
    name: string;
    type: AssignmentCopyType;
    data?: any;
    enable_copy?: boolean;
    copy_tip?: string;
    open_tip?: string;
    omit_errors?: boolean;
  }): Rendered[] {
    opts = defaults(opts, {
      name: required,
      type: required,
      data: {},
      enable_copy: false,
      copy_tip: "",
      open_tip: "",
      omit_errors: false,
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
    const v: Rendered[] = [];
    if (opts.enable_copy) {
      if (opts.data.start) {
        v.push(this.render_open_copying(opts.name, open, stop));
      } else if (opts.data.time) {
        v.push(
          this.render_open_recopy(
            opts.name,
            open,
            copy,
            opts.copy_tip as string,
            opts.open_tip as string
          )
        );
      } else {
        v.push(this.render_copy(opts.name, copy, opts.copy_tip as string));
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

  private render_peer_assign(): Rendered {
    return (
      <Col md={4} key="peer_assign">
        {this.render_last({
          name: "Peer Assign",
          data: this.props.info.last_peer_assignment,
          type: "peer-assigned",
          enable_copy: this.props.info.last_collect != null,
          copy_tip:
            "Copy collected assignments from your project to this student's project so they can grade them.",
          open_tip:
            "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading.",
        })}
      </Col>
    );
  }

  private render_peer_collect(): Rendered {
    return (
      <Col md={4} key="peer_collect">
        {this.render_last({
          name: "Peer Collect",
          data: this.props.info.last_peer_collect,
          type: "peer-collected",
          enable_copy: this.props.info.last_peer_assignment != null,
          copy_tip:
            "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
          open_tip:
            "Open your copy of your student's peer grading work in your own project, so that you can grade their work.",
        })}
      </Col>
    );
  }

  public render(): Rendered {
    let show_grade_col, show_return_graded;
    const peer_grade: boolean = !!this.props.assignment.getIn([
      "peer_grade",
      "enabled",
    ]);
    const skip_grading: boolean = !!this.props.assignment.get("skip_grading");
    const skip_assignment: boolean =
      !!this.props.assignment.get("skip_assignment");
    const skip_collect: boolean = !!this.props.assignment.get("skip_collect");
    if (peer_grade) {
      show_grade_col = !skip_grading && this.props.info.last_peer_collect;
      show_return_graded =
        this.props.grade || (skip_grading && this.props.info.last_peer_collect);
    } else {
      show_grade_col =
        (!skip_grading && this.props.info.last_collect) || skip_collect;
      show_return_graded =
        this.props.grade ||
        (skip_grading && this.props.info.last_collect) ||
        (skip_grading && skip_collect);
    }

    const width = peer_grade ? 4 : 6;
    return (
      <div>
        <Row
          style={{
            borderTop: "1px solid #aaa",
            paddingTop: "5px",
            paddingBottom: "5px",
          }}
        >
          <Col md={4} key="title">
            {this.props.title}
          </Col>
          <Col md={20} key="rest">
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
                  omit_errors: skip_assignment,
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
                      omit_errors: skip_collect,
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
                        "This opens the returned assignment directly in their project.",
                    })
                  : undefined}
              </Col>
            </Row>
          </Col>
        </Row>
      </div>
    );
  }
}
