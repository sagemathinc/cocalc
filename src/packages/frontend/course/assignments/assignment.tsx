/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Input,
  Popconfirm,
  Popover,
  Row,
  Switch,
  Space,
} from "antd";
import { ReactElement, ReactNode, useEffect, useState } from "react";
import { DebounceInput } from "react-debounce-input";
import { FormattedMessage, useIntl } from "react-intl";
import { AppRedux, useActions } from "@cocalc/frontend/app-framework";
import {
  DateTimePicker,
  Icon,
  IconName,
  Loading,
  Tip,
} from "@cocalc/frontend/components";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { course, labels } from "@cocalc/frontend/i18n";
import { capitalize, trunc_middle } from "@cocalc/util/misc";
import { CourseActions } from "../actions";
import { BigTime, Progress, StudentAssignmentInfoHeader } from "../common";
import { STEP_NAMES, STEPS_INTL } from "../common/consts";
import { NbgraderButton } from "../nbgrader/nbgrader-button";
import type {
  AssignmentRecord,
  CourseStore,
  IsGradingMap,
  NBgraderRunInfo,
} from "../store";
import * as styles from "../styles";
import { AssignmentCopyStep, AssignmentStatus } from "../types";
import {
  step_direction,
  step_ready,
  step_verb,
  STEPS,
  useButtonSize,
} from "../util";
import { StudentListForAssignment } from "./assignment-student-list";
import { ConfigurePeerGrading } from "./configure-peer";
import { STUDENT_SUBDIR } from "./consts";
import { ComputeServerButton } from "../compute";

interface AssignmentProps {
  active_feedback_edits: IsGradingMap;
  assignment: AssignmentRecord;
  background?: string;
  expand_peer_config?: boolean;
  frame_id?: string;
  is_expanded?: boolean;
  name: string;
  nbgrader_run_info?: NBgraderRunInfo;
  project_id: string;
  redux: AppRedux;
  students: object;
  user_map: object;
}

function useCopyConfirmState() {
  const [copy_confirm, set_copy_confirm] = useState<{
    [state in AssignmentCopyStep]: boolean;
  }>({
    assignment: false,
    collect: false,
    peer_assignment: false,
    peer_collect: false,
    return_graded: false,
  });

  // modify flags, don't replace this entirely
  function set(state: AssignmentCopyStep, value: boolean): void {
    set_copy_confirm((prev) => ({ ...prev, [state]: value }));
  }

  return { copy_confirm, set };
}

export function Assignment({
  active_feedback_edits,
  assignment,
  background,
  expand_peer_config,
  frame_id,
  is_expanded,
  name,
  nbgrader_run_info,
  project_id,
  redux,
  students,
  user_map,
}: AssignmentProps) {
  const intl = useIntl();
  const size = useButtonSize();
  const assignmentId = assignment.get("assignment_id");
  const noteProp = assignment.get("note") ?? "";
  const [noteValue, setNoteValue] = useState<string>(noteProp);
  const [noteEditing, setNoteEditing] = useState<boolean>(false);

  useEffect(() => {
    setNoteValue(noteProp);
    setNoteEditing(false);
  }, [assignmentId]);

  useEffect(() => {
    if (!noteEditing) {
      setNoteValue(noteProp);
    }
  }, [noteProp, noteEditing]);

  useEffect(() => {
    if (is_peer_graded()) {
      for (const step of ["assignment", "collect"] as const) {
        if (assignment.get(`skip_${step}` as any)) {
          actions.assignments.set_skip(assignmentId, step, false);
        }
      }
    }
  }, [assignmentId, assignment.getIn(["peer_grade", "enabled"])]);

  useEffect(() => {
    if (assignment.get("nbgrader") && is_peer_graded()) {
      actions.assignments.set_peer_grade(assignmentId, { enabled: false });
      setPeerDisabledForNbgrader(true);
    }
  }, [
    assignmentId,
    assignment.get("nbgrader"),
    assignment.getIn(["peer_grade", "enabled"]),
  ]);

  const [
    copy_assignment_confirm_overwrite,
    set_copy_assignment_confirm_overwrite,
  ] = useState<boolean>(false);
  const [peerDisabledForNbgrader, setPeerDisabledForNbgrader] = useState(false);
  const [
    copy_assignment_confirm_overwrite_text,
    set_copy_assignment_confirm_overwrite_text,
  ] = useState<string>("");
  const [student_search, set_student_search] = useState<string>("");
  const [copy_confirm, set_copy_confirm] = useState<boolean>(false);

  const { copy_confirm: copy_confirm_state, set: set_copy_confirm_state } =
    useCopyConfirmState();
  const { copy_confirm: copy_confirm_all, set: set_copy_confirm_all } =
    useCopyConfirmState();

  const actions = useActions<CourseActions>({ name });

  function get_store(): CourseStore {
    return actions.get_store();
  }

  function is_peer_graded() {
    return !!assignment.getIn(["peer_grade", "enabled"]);
  }

  function render_due() {
    return (
      <Space align="center">
        <div>Due:</div>
        <Tip
          placement="top"
          title="Set the due date"
          tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment)."
        >
          <DateTimePicker
            placeholder={"Set Due Date"}
            value={assignment.get("due_date")}
            onChange={date_change}
          />
        </Tip>
      </Space>
    );
  }

  function date_change(date): void {
    actions.assignments.set_due_date(
      assignment.get("assignment_id"),
      date != null ? date.toISOString() : undefined,
    );
  }

  function render_note() {
    return (
      <Space
        key="note"
        align="start"
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
        }}
      >
        <Tip
          title="Notes about this assignment"
          tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment."
        >
          <Button
            icon={<Icon name="pencil" />}
            type={noteEditing ? "primary" : "default"}
            onClick={() => {
              if (noteEditing) {
                actions.assignments.set_assignment_note(
                  assignmentId,
                  noteValue,
                );
              }
              setNoteEditing(!noteEditing);
            }}
          >
            {noteEditing ? "Done" : "Notes:"}
          </Button>
        </Tip>
        <div style={{ minWidth: 0, width: "100%" }}>
          {noteEditing ? (
            <MultiMarkdownInput
              value={noteValue}
              onChange={(value: string) => setNoteValue(value)}
              placeholder="Private notes about this assignment (not visible to students)"
              height="200px"
              minimal
              enableUpload={false}
            />
          ) : (
            <StaticMarkdown value={noteValue ?? ""} />
          )}
        </div>
      </Space>
    );
  }

  function render_export_file_use_times() {
    return (
      <Tip
        title="Export when students used files"
        tip="Export a JSON file containing extensive information about exactly when students have opened or edited files in this assignment.  The JSON file will open in a new tab; the access_times (in milliseconds since the UNIX epoch) are when they opened the file and the edit_times are when they actually changed it through CoCalc's web-based editor."
      >
        <Button
          onClick={() =>
            actions.export.file_use_times(assignment.get("assignment_id"))
          }
        >
          File Use Times
        </Button>
      </Tip>
    );
  }

  function render_export_assignment() {
    return (
      <Tip
        title="Export collected student files"
        tip="Export all student work to files in a single directory that are easy to grade or archive outside of CoCalc.  Any Jupyter notebooks or Sage worksheets are first converted to PDF (if possible), and all files are renamed with the student as a filename prefix."
      >
        <Button
          onClick={() =>
            actions.assignments.export_collected(
              assignment.get("assignment_id"),
            )
          }
        >
          Export
        </Button>
      </Tip>
    );
  }

  function render_no_content() {
    if (assignment.get("deleted")) {
      // no point
      return null;
    }
    return (
      <div style={{ margin: "15px auto", maxWidth: "800px", fontSize: "12pt" }}>
        There are no files in this assignment yet. Please{" "}
        <a onClick={open_assignment_path}>open the directory</a> for this
        assignment, then create, upload, or copy any content you want into that
        directory. {intl.formatMessage(labels.you)} will then be able to send it
        to all of your students.
      </div>
    );
  }

  function render_more_header(num_files: number) {
    const status: AssignmentStatus | undefined =
      get_store().get_assignment_status(assignment.get("assignment_id"));
    if (status == null) {
      return <Loading key="loading_more" />;
    }
    const v: ReactElement<any>[] = [];
    const stackSize = size === "small" ? "small" : "middle";

    v.push(
      <Space
        key="header-stack"
        direction="vertical"
        size={stackSize}
        style={{ width: "100%" }}
      >
        <Row gutter={[8, 4]} align="top" justify="space-between">
          <Col md={16}>
            <Space wrap size={[12, 6]}>
              {render_open_button()}
              {render_due()}
              {render_peer_button()}
              <ComputeServerButton actions={actions} unit={assignment as any} />
            </Space>
          </Col>
          <Col md={8} style={{ marginLeft: "auto" }}>
            <Space
              wrap
              size={[12, 6]}
              style={{ width: "100%", justifyContent: "flex-end" }}
            >
              {render_export_file_use_times()}
              {render_export_assignment()}
              {render_delete_button()}
            </Space>
          </Col>
        </Row>

        {peerDisabledForNbgrader ? (
          <div style={{ marginTop: 8 }}>
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setPeerDisabledForNbgrader(false)}
              message="Peer grading was disabled because nbgrader notebooks were detected. Remove nbgrader metadata to re-enable peer grading."
            />
          </div>
        ) : null}

        {expand_peer_config ? (
          <ConfigurePeerGrading actions={actions} assignment={assignment} />
        ) : null}

        {render_note()}
        <Divider style={{ borderTopWidth: 3, margin: 0 }} />

        {(() => {
          const peer = is_peer_graded();

          if (num_files === 0) return null;

          const actions: Partial<
            Record<AssignmentCopyStep | "grade", ReactElement<any>[]>
          > = {};
          const progress: Partial<
            Record<AssignmentCopyStep | "grade", ReactElement<any>>
          > = {};

          function add_action(
            step: AssignmentCopyStep | "grade",
            element: ReactElement<any>,
          ) {
            actions[step] = [...(actions[step] ?? []), element];
          }

          const renderedMap: Partial<Record<AssignmentCopyStep, boolean>> = {};

          for (const name of STEPS(peer)) {
            const rendered = render_step_run_all(name, status);
            // squeeze in the skip grading button (don't add it to STEPS!)
            if (rendered != null) {
              renderedMap[name] = true;
              if (Array.isArray(rendered)) {
                const buttons = rendered.filter(
                  (elem) => elem?.type !== Progress,
                );
                const prog = rendered.find(
                  (elem) => elem?.type === Progress,
                ) as ReactElement | undefined;
                if (buttons.length > 0) {
                  add_action(name, <span key={name}>{buttons}</span>);
                }
                if (prog) {
                  progress[name] = prog;
                }
              } else {
                add_action(name, <span key={name}>{rendered}</span>);
              }
            }

            if (!peer) {
              if (rendered && name === "assignment") {
                add_action(
                  "assignment",
                  <span key="skip-assignment">
                    {render_skip_switch("assignment")}
                  </span>,
                );
              } else if (rendered && name === "collect") {
                add_action(
                  "collect",
                  <span key="skip-collect">
                    {render_skip_switch("collect")}
                  </span>,
                );
              }
            }
          }

          const nbgraderAction = render_nbgrader_button(status);
          if (nbgraderAction && status.collect > 0) {
            add_action("grade", nbgraderAction);
          }

          if (status.collect > 0 && renderedMap.collect) {
            add_action(
              "grade",
              <span key="skip-grade">
                {render_skip_switch("grading", status.collect === 0)}
              </span>,
            );
          }

          if (
            status.peer_assignment != null &&
            progress.peer_assignment == null
          ) {
            progress["peer_assignment"] = (
              <Progress
                key="progress-peer-assign"
                done={status.peer_assignment}
                not_done={status.not_peer_assignment}
                step="peer assigned"
              />
            );
          }

          if (status.peer_collect != null && progress.peer_collect == null) {
            progress["peer_collect"] = (
              <Progress
                key="progress-peer-collect"
                done={status.peer_collect}
                not_done={status.not_peer_collect}
                step="peer collected"
              />
            );
          }

          if (renderedMap.return_graded) {
            progress["return_graded"] = (
              <Progress
                key="progress-return"
                done={status.return_graded}
                not_done={status.not_return_graded}
                step="returned"
              />
            );
          }

          return (
            <>
              <StudentAssignmentInfoHeader
                key="header"
                title="Student"
                peer_grade={peer}
                mode="assignment"
                actions={actions}
                progress={progress}
                filter={
                  <DebounceInput
                    debounceTimeout={500}
                    element={Input as any}
                    placeholder={"Filter students..."}
                    value={student_search}
                    onChange={(e) => set_student_search(e.target.value)}
                  />
                }
              />
            </>
          );
        })()}
      </Space>,
    );
    /* The whiteSpace:'normal' here is because we put this in an
         antd Card title, which has line wrapping disabled. */
    return <div style={{ whiteSpace: "normal" }}>{v}</div>;
  }

  function render_more() {
    const num_files = assignment.get("listing")?.size ?? 0;
    let body;
    if (num_files == 0) {
      body = render_no_content();
    } else {
      body = (
        <StudentListForAssignment
          redux={redux}
          frame_id={frame_id}
          name={name}
          assignment={assignment}
          students={students}
          user_map={user_map}
          active_feedback_edits={active_feedback_edits}
          nbgrader_run_info={nbgrader_run_info}
          search={student_search}
        />
      );
    }
    return (
      <Row key="more">
        <Col sm={24}>
          <ConfigProvider componentSize={size}>
            <Card>
              {render_more_header(num_files)}
              {body}
            </Card>
          </ConfigProvider>
        </Col>
      </Row>
    );
  }

  function open_assignment_path(): void {
    if (assignment.get("listing")?.size == 0) {
      // there are no files yet, so we *close* the assignment
      // details panel.  This is just **a hack** so that the user
      // has to re-open it after adding files, which will trigger
      // updating the directory listing, hence show the rest
      // of the assignment info.  The alternative would be
      // polling the directory or watching listings, which is
      // a lot more work to properly implement.
      actions.toggle_item_expansion(
        "assignment",
        assignment.get("assignment_id"),
      );
    }
    return redux
      .getProjectActions(project_id)
      .open_directory(assignment.get("path"));
  }

  function render_open_button() {
    return (
      <Tip
        key="open"
        title={
          <span>
            <Icon name="folder-open" /> Open Folder
          </span>
        }
        tip="Open the directory in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment."
      >
        <Button onClick={open_assignment_path}>
          <Icon name="folder-open" /> {intl.formatMessage(labels.open)}
        </Button>
      </Tip>
    );
  }

  function render_step_popover(
    step: AssignmentCopyStep,
    opts: {
      type: "primary" | "default" | "dashed";
      title: ReactNode;
      tip: ReactNode;
      content: ReactNode;
      onOpen?: () => void;
      onClose?: () => void;
    },
  ) {
    const open = copy_confirm_state[step];
    const handleOpenChange = (next: boolean) => {
      set_copy_confirm_state(step, next);
      set_copy_confirm(next);
      if (next) {
        opts.onOpen?.();
      } else {
        set_copy_confirm_all(step, false);
        opts.onClose?.();
      }
    };
    return (
      <Popover
        key={step}
        placement="bottom"
        trigger="click"
        open={open}
        onOpenChange={handleOpenChange}
        content={opts.content}
        overlayInnerStyle={{ maxWidth: 545 }}
      >
        <span style={{ display: "inline-block" }}>
          <Tip placement="bottom" title={opts.title} tip={opts.tip}>
            <Button
              type={opts.type}
              disabled={copy_confirm && !open}
              size="small"
              icon={<Icon name="forward" />}
              onClick={() => handleOpenChange(true)}
            />
          </Tip>
        </span>
      </Popover>
    );
  }

  function render_assignment_button(status) {
    const last_assignment = assignment.get("last_assignment");
    // Primary if it hasn't been assigned before or if it hasn't started assigning.
    let type;
    if (
      !last_assignment ||
      !(last_assignment.get("time") || last_assignment.get("start"))
    ) {
      type = "primary";
    } else {
      type = "default";
    }
    if (status.assignment > 0 && status.not_assignment === 0) {
      type = "dashed";
    }

    const label = intl.formatMessage(STEPS_INTL, {
      step: STEP_NAMES.indexOf("Assign"),
    });
    const you = intl.formatMessage(labels.you);
    const students = intl.formatMessage(course.students);
    const tooltip = intl.formatMessage({
      id: "course.assignments.assign.tooltip",
      defaultMessage:
        "Copy the files for this assignment from this project to all other student projects.",
      description: "Students in an online course",
    });

    return [
      render_step_popover("assignment", {
        type,
        title: (
          <span>
            {label}: <Icon name="user-secret" /> {you}{" "}
            <Icon name="arrow-right" /> <Icon name="users" /> {students}{" "}
          </span>
        ),
        tip: tooltip,
        content: render_step_confirm("assignment", status),
        onOpen: () => {
          const assignment_id: string | undefined =
            assignment.get("assignment_id");
          actions.assignments.update_listing(assignment_id);
        },
        onClose: () => {
          set_copy_assignment_confirm_overwrite(false);
        },
      }),
      <Progress
        key="progress"
        done={status.assignment}
        not_done={status.not_assignment}
        step="assigned"
        skipped={assignment.get("skip_assignment")}
      />,
    ];
  }

  function render_step_confirm(step, status) {
    return render_copy_confirm(step, status);
  }

  function render_copy_assignment_confirm_overwrite(step) {
    if (!copy_assignment_confirm_overwrite) {
      return;
    }
    const do_it = () => {
      copy_assignment(step, false, true);
      set_copy_assignment_confirm_overwrite(false);
      set_copy_assignment_confirm_overwrite_text("");
    };
    return (
      <div style={{ marginTop: "15px" }}>
        Type in "OVERWRITE" if you are sure you want to overwrite any work they
        may have.
        <Input
          autoFocus
          onChange={(e) =>
            set_copy_assignment_confirm_overwrite_text((e.target as any).value)
          }
          style={{ marginTop: "1ex" }}
        />
        <Space style={{ textAlign: "center", marginTop: "15px" }}>
          <Button
            disabled={copy_assignment_confirm_overwrite_text !== "OVERWRITE"}
            danger
            type="primary"
            onClick={do_it}
          >
            <Icon name="exclamation-triangle" /> Confirm replacing files
          </Button>
        </Space>
      </div>
    );
  }

  function copy_assignment(
    step,
    new_only: boolean,
    overwrite: boolean = false,
  ) {
    // assign assignment to all (non-deleted) students
    const assignment_id: string | undefined = assignment.get("assignment_id");
    if (assignment_id == null) throw Error("bug");
    switch (step) {
      case "assignment":
        actions.assignments.copy_assignment_to_all_students(
          assignment_id,
          new_only,
          overwrite,
        );
        break;
      case "collect":
        actions.assignments.copy_assignment_from_all_students(
          assignment_id,
          new_only,
        );
        break;
      case "peer_assignment":
        actions.assignments.peer_copy_to_all_students(assignment_id, new_only);
        break;
      case "peer_collect":
        actions.assignments.peer_collect_from_all_students(
          assignment_id,
          new_only,
        );
        break;
      case "return_graded":
        actions.assignments.return_assignment_to_all_students(
          assignment_id,
          new_only,
        );
        break;
      default:
        console.log(`BUG -- unknown step: ${step}`);
    }
    set_copy_confirm_state(step, false);
    set_copy_confirm_all(step, false);
    set_copy_confirm(false);
  }

  function render_skip_switch(
    step: "assignment" | "collect" | "grading",
    disabled?: boolean,
  ) {
    const skipped = assignment.get(`skip_${step}` as any);
    return (
      <Tip
        title="Skip step in workflow"
        tip="Toggle to allow proceeding to the next step without completing this one."
      >
        <Switch
          checked={!!skipped}
          onChange={() =>
            actions.assignments.set_skip(
              assignment.get("assignment_id"),
              step,
              !skipped,
            )
          }
          checkedChildren="Skip"
          unCheckedChildren="Skip"
          size="small"
          disabled={disabled}
        />
      </Tip>
    );
  }

  function copy_confirm_all_caution(step: AssignmentCopyStep) {
    const caution = "CAUTION: All files will be copied again.";
    const it_will =
      "it will get copied to a backup file ending in a tilde (~), or possibly only be available in snapshots.";
    switch (step) {
      case "assignment":
        return (
          <span>
            {caution} If you updated a file that a student has also worked on,{" "}
            {it_will} Select "Replace student files!" if you do <b>not</b> want
            to create any backups and want to <b>delete</b> all other files in
            the assignment folder of student projects.{" "}
            <a
              target="_blank"
              href="https://doc.cocalc.com/teaching-tips_and_tricks.html#how-exactly-are-assignments-copied-to-students"
            >
              Details
            </a>
          </span>
        );
      case "collect":
      case "peer_collect":
        return `${caution} If you have graded or edited a file that a student has updated, ${it_will}`;
      case "peer_assignment":
        return `${caution} If a student worked on a previously assigned file, ${it_will}`;
      case "return_graded":
        return `${caution} If a student edited a previously returned file, ${it_will}`;
    }
  }

  function render_copy_confirm_overwrite_all(step: AssignmentCopyStep) {
    return (
      <div key={"copy_confirm_overwrite_all"}>
        <div>{copy_confirm_all_caution(step)}</div>
        <Space>
          <Button
            key={"all"}
            type="primary"
            disabled={copy_assignment_confirm_overwrite}
            onClick={() => copy_assignment(step, false)}
          >
            Yes, do it (with backup)
          </Button>
          {step === "assignment" ? (
            <Button
              key={"all-overwrite"}
              danger
              onClick={() => set_copy_assignment_confirm_overwrite(true)}
              disabled={copy_assignment_confirm_overwrite}
            >
              Replace student files!
            </Button>
          ) : undefined}
          <Button
            key="back"
            onClick={() => {
              set_copy_confirm_all(step, false);
              set_copy_assignment_confirm_overwrite(false);
            }}
          >
            Back
          </Button>
        </Space>
        {render_copy_assignment_confirm_overwrite(step)}
      </div>
    );
  }

  function render_copy_confirm(step: AssignmentCopyStep, status) {
    const not_done = status[`not_${step}`];
    const possible = not_done + status[step];
    const total = get_store().num_students();
    const message = (
      <Space
        direction="vertical"
        style={{ display: "inline-flex", alignItems: "stretch" }}
      >
        {/* Only the student/ subdirectory will be copied to the students. nbgrader docs */}
        {step === "assignment" && assignment.get("has_student_subdir") ? (
          <Alert
            type="info"
            message={
              <span>
                Only the {STUDENT_SUBDIR}/ subdirectory will be copied to the
                students.{" "}
                <a
                  target="_blank"
                  href="https://doc.cocalc.com/teaching-nbgrader.html#student-version"
                >
                  nbgrader docs
                </a>
              </span>
            }
          />
        ) : undefined}
        {/* Assign this assignment to */}
        <div>
          {capitalize(step_verb(step))} this assignment {step_direction(step)}
        </div>
        {/* The 15 students not already assigned to */}
        {not_done && !copy_confirm_all[step] ? (
          <Button
            key="new"
            type="primary"
            onClick={() => copy_assignment(step, true)}
          >
            {not_done === total ? (
              <>All {total} students</>
            ) : (
              <>
                The {not_done} student{not_done > 1 ? "s" : ""} not already{" "}
                {step_verb(step)}ed {step_direction(step)}
              </>
            )}
          </Button>
        ) : undefined}
        {/* All 19 students... */}
        {not_done !== possible ? (
          <Button
            key="all"
            danger
            disabled={copy_confirm_all[step]}
            onClick={() => {
              set_copy_confirm_all(step, true);
            }}
          >
            All {possible} students
            {step_ready(step, possible)}...
          </Button>
        ) : undefined}
        {copy_confirm_all[step]
          ? render_copy_confirm_overwrite_all(step)
          : undefined}
      </Space>
    );
    return (
      <Alert key={`copy_confirm_${step}`} type="warning" message={message} />
    );
  }

  function render_collect_tip() {
    return (
      <span key="normal">
        <FormattedMessage
          id="course.assignments.collect.tooltip"
          defaultMessage={`Collect an assignment from all of your students.
          (There is currently no way to schedule collection at a specific time;
          instead, collection happens when you click the button.)`}
        />
      </span>
    );
  }

  function render_step_run_all(state: AssignmentCopyStep, status) {
    switch (state) {
      case "collect":
        return render_collect_button(status);
      case "return_graded":
        return render_return_graded_button(status);
      case "peer_assignment":
        return render_peer_assignment_button(status);
      case "peer_collect":
        return render_peer_collect_button(status);
      case "assignment":
        return render_assignment_button(status);
    }
  }

  function render_collect_button(status) {
    if (status.assignment === 0) {
      // no button if nothing ever assigned
      return;
    }
    let type;
    if (status.collect > 0) {
      // Have already collected something
      if (status.not_collect === 0) {
        type = "dashed";
      } else {
        type = "default";
      }
    } else {
      type = "primary";
    }
    return [
      render_step_popover("collect", {
        type,
        title: (
          <span>
            Collect: <Icon name="users" /> {intl.formatMessage(course.students)}{" "}
            <Icon name="arrow-right" /> <Icon name="user-secret" /> You
          </span>
        ),
        tip: render_collect_tip(),
        content: render_step_confirm("collect", status),
      }),
      <Progress
        key="progress"
        done={status.collect}
        not_done={status.not_collect}
        step="collected"
        skipped={assignment.get("skip_collect")}
      />,
    ];
  }

  function render_peer_assign_tip() {
    return (
      <span key="normal">
        Send copies of collected homework out to all students for peer grading.
      </span>
    );
  }

  function render_peer_assignment_button(status) {
    // Render the "Peer Assign..." button in the top row, for peer assigning to all
    // students in the course.
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
    let type;
    if (status.peer_assignment > 0) {
      // haven't peer-assigned anything yet
      if (status.not_peer_assignment === 0) {
        type = "dashed";
      } else {
        type = "default";
      }
    } else {
      type = "primary";
    }
    const label = intl.formatMessage(STEPS_INTL, {
      step: STEP_NAMES.indexOf("Peer Assign"),
    });
    return [
      render_step_popover("peer_assignment", {
        type,
        title: (
          <span>
            {label}: <Icon name="users" /> {intl.formatMessage(labels.you)}{" "}
            <Icon name="arrow-right" /> <Icon name="user-secret" />{" "}
            {intl.formatMessage(course.students)}
          </span>
        ),
        tip: render_peer_assign_tip(),
        content: render_step_confirm("peer_assignment", status),
      }),
      <Progress
        key="progress"
        done={status.peer_assignment}
        not_done={status.not_peer_assignment}
        step="peer assigned"
      />,
    ];
  }

  function render_peer_collect_tip() {
    return (
      <span key="normal">Collect the peer grading that your students did.</span>
    );
  }

  function render_peer_collect_button(status) {
    // Render the "Peer Collect..." button in the top row, for collecting peer grading from all
    // students in the course.
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
    let type;
    if (status.peer_collect > 0) {
      // haven't peer-collected anything yet
      if (status.not_peer_collect === 0) {
        type = "dashed";
      } else {
        type = "default";
      }
    } else {
      // warning, since we have already collected and this may overwrite
      type = "primary";
    }
    const label = intl.formatMessage(STEPS_INTL, {
      step: STEP_NAMES.indexOf("Peer Collect"),
    });
    return [
      render_step_popover("peer_collect", {
        type,
        title: (
          <span>
            {label}: <Icon name="users" /> {intl.formatMessage(course.students)}{" "}
            <Icon name="arrow-right" /> <Icon name="user-secret" /> You
          </span>
        ),
        tip: render_peer_collect_tip(),
        content: render_step_confirm("peer_collect", status),
      }),
      <Progress
        key="progress"
        done={status.peer_collect}
        not_done={status.not_peer_collect}
        step="peer collected"
      />,
    ];
  }

  function render_nbgrader_button(status) {
    if (
      status.collect === 0 ||
      !assignment.get("nbgrader") ||
      assignment.get("skip_grading")
    ) {
      // No button if nothing collected or not nbgrader support or
      // decided to skip grading
      return;
    }

    return (
      <NbgraderButton
        assignment_id={assignment.get("assignment_id")}
        name={name}
      />
    );
  }

  function render_return_graded_button(status) {
    if (status.collect === 0) {
      // No button if nothing collected.
      return;
    }
    if (status.peer_collect != null && status.peer_collect === 0) {
      // Peer grading enabled, but we didn't collect anything yet
      return;
    }
    if (
      !assignment.get("skip_grading") &&
      status.not_return_graded === 0 &&
      status.return_graded === 0
    ) {
      // Nothing unreturned and ungraded yet and also nothing returned yet
      return;
    }
    let type;
    if (status.return_graded > 0) {
      // Have already returned some
      if (status.not_return_graded === 0) {
        type = "dashed";
      } else {
        type = "default";
      }
    } else {
      type = "primary";
    }
    const label = intl.formatMessage(STEPS_INTL, {
      step: STEP_NAMES.indexOf("Return"),
    });
    return [
      render_step_popover("return_graded", {
        type,
        title: (
          <span>
            {label}: <Icon name="user-secret" /> You <Icon name="arrow-right" />{" "}
            <Icon name="users" /> {intl.formatMessage(course.students)}{" "}
          </span>
        ),
        tip: "Copy the graded versions of files for this assignment from this project to all other student projects.",
        content: render_step_confirm("return_graded", status),
      }),
      <Progress
        key="progress"
        done={status.return_graded}
        not_done={status.not_return_graded}
        step="returned"
      />,
    ];
  }

  function delete_assignment() {
    actions.assignments.delete_assignment(assignment.get("assignment_id"));
  }

  function undelete_assignment() {
    return actions.assignments.undelete_assignment(
      assignment.get("assignment_id"),
    );
  }

  function render_delete_button() {
    if (assignment.get("deleted")) {
      return (
        <Tip
          key="delete"
          placement="left"
          title={intl.formatMessage({
            id: "course.assignment.undelete.title",
            defaultMessage: "Undelete assignment",
          })}
          tip={intl.formatMessage({
            id: "course.assignment.undelete.tooltip",
            defaultMessage:
              "Make the assignment visible again in the assignment list and in student grade lists.",
          })}
        >
          <Button onClick={undelete_assignment}>
            <Icon name="trash" /> {intl.formatMessage(labels.undelete)}
          </Button>
        </Tip>
      );
    } else {
      return (
        <Popconfirm
          title={
            <div style={{ maxWidth: "400px" }}>
              <FormattedMessage
                id="course.assignment.delete.confirm.info"
                defaultMessage={`<b>Are you sure you want to delete {name}"?</b>
                  {br}
                  This removes it from the assignment list and student grade lists,
                  but does not delete any files off of disk.
                  You can undelete an assignment later by showing it using the 'Show deleted assignments' button.`}
                values={{
                  name: trunc_middle(assignment.get("path"), 24),
                  br: <br />,
                }}
              />
            </div>
          }
          onConfirm={delete_assignment}
          cancelText={intl.formatMessage(labels.cancel)}
        >
          <Button>
            <Icon name="trash" /> {intl.formatMessage(labels.delete)}...
          </Button>
        </Popconfirm>
      );
    }
  }

  function render_peer_button() {
    let icon;
    if (is_peer_graded()) {
      icon = "check-square-o";
    } else {
      icon = "square-o";
    }
    const disabledForNbgrader = !!assignment.get("nbgrader");
    const button = (
      <Button
        disabled={expand_peer_config || disabledForNbgrader}
        onClick={() =>
          actions.toggle_item_expansion(
            "peer_config",
            assignment.get("assignment_id"),
          )
        }
      >
        <Icon name={icon} /> Peer Grading...
      </Button>
    );
    if (!disabledForNbgrader) {
      return button;
    }
    return (
      <Tip title="Peer grading is disabled because nbgrader notebooks were detected">
        <span>{button}</span>
      </Tip>
    );
  }

  function render_summary_due_date() {
    const due_date = assignment.get("due_date");
    if (due_date) {
      return (
        <div style={{ marginTop: "12px" }}>
          Due <BigTime date={due_date} />
        </div>
      );
    }
  }

  function render_assignment_name() {
    const num_items = assignment.get("listing")?.size ?? 0;
    return (
      <span>
        {trunc_middle(assignment.get("path"), 80)}
        {assignment.get("deleted") ? <b> (deleted)</b> : undefined}
        {num_items == 0 ? "  - add content to this assignment..." : undefined}
      </span>
    );
  }

  function render_assignment_title_link() {
    return (
      <a
        href=""
        onClick={(e) => {
          e.preventDefault();
          actions.toggle_item_expansion(
            "assignment",
            assignment.get("assignment_id"),
          );
        }}
      >
        <Icon
          style={{ marginRight: "10px" }}
          name={is_expanded ? "caret-down" : "caret-right"}
        />
        {render_assignment_name()}
      </a>
    );
  }

  function render_summary_line() {
    return (
      <Row key="summary" style={{ backgroundColor: background }}>
        <Col md={12}>
          <h5>{render_assignment_title_link()}</h5>
        </Col>
        <Col md={12}>{render_summary_due_date()}</Col>
      </Row>
    );
  }

  return (
    <div>
      <Row style={is_expanded ? styles.selected_entry : styles.entry_style}>
        <Col xs={24}>
          {render_summary_line()}
          {is_expanded ? render_more() : undefined}
        </Col>
      </Row>
    </div>
  );
}
