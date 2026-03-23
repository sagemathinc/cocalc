/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Card, ConfigProvider, Divider, Space } from "antd";
import { MouseEvent, ReactNode, useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { AppRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import { CourseActions } from "../actions";
import { StudentListForAssignment } from "../assignments/assignment-student-list";
import { StudentListForHandout } from "../handouts/handout-student-list";
import type {
  AssignmentRecord,
  CourseStore,
  HandoutRecord,
  IsGradingMap,
  NBgraderRunInfo,
  StudentsMap,
} from "../store";
import type { UserMap } from "../../todo-types";
import { useButtonSize } from "../util";
import { CourseUnitControls } from "./course-unit-controls";
import { noContentMessages, noteMessages } from "./course-unit-strings";
import type { UnitLabel } from "./course-unit-strings";
import { isAssignmentUnit } from "./course-unit-types";
import type { HandoutStatus } from "./course-unit-types";
import { AssignmentHeader } from "./assignment-header";
import { HandoutHeader } from "./handout-header";
import { PrivateNotes } from "./private-notes";

interface CourseUnitCardCommonProps {
  actions: CourseActions;
  redux: AppRedux;
  name: string;
  students: StudentsMap;
  user_map: UserMap;
  frame_id?: string;
  project_id: string;
}

interface CourseUnitCardAssignmentProps {
  unit: AssignmentRecord;
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
  expand_peer_config?: boolean;
}

interface CourseUnitCardHandoutProps {
  unit: HandoutRecord;
}

type CourseUnitCardProps = CourseUnitCardCommonProps &
  (CourseUnitCardAssignmentProps | CourseUnitCardHandoutProps);

export function CourseUnitCard(props: CourseUnitCardProps) {
  const size = useButtonSize();
  const intl = useIntl();

  const {
    unit,
    actions,
    redux,
    name,
    students,
    user_map,
    frame_id,
    project_id,
  } = props;
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [showPeerDisabledAlert, setShowPeerDisabledAlert] =
    useState<boolean>(false);

  const assignment = isAssignmentUnit(unit) ? unit : undefined;
  const unitLabel: UnitLabel = assignment ? "assignment" : "handout";
  const unitId = assignment
    ? assignment.get("assignment_id")
    : (unit as HandoutRecord).get("handout_id");
  const noteValue =
    (assignment
      ? assignment.get("note")
      : (unit as HandoutRecord).get("note")) ?? "";
  const assignmentId = assignment ? assignment.get("assignment_id") : "";
  const peerEnabled = assignment?.getIn(["peer_grade", "enabled"]);
  const nbgraderEnabled = assignment?.get("nbgrader");
  const unitPath = assignment
    ? assignment.get("path")
    : (unit as HandoutRecord).get("path");
  const unitDeleted = assignment
    ? assignment.get("deleted")
    : (unit as HandoutRecord).get("deleted");
  const initialHasFiles = assignment
    ? (assignment.get("listing")?.size ?? 0) > 0
    : null;
  const [hasFiles, setHasFiles] = useState<boolean | null>(initialHasFiles);

  useEffect(() => {
    if (!assignmentId || !peerEnabled) return;
    for (const step of ["assignment", "collect"] as const) {
      if (assignment?.get(`skip_${step}` as any)) {
        actions.assignments.set_skip(assignmentId, step, false);
      }
    }
  }, [assignmentId, peerEnabled]);

  useEffect(() => {
    if (!assignmentId || !nbgraderEnabled || !peerEnabled) return;
    actions.assignments.set_peer_grade(assignmentId, { enabled: false });
    setShowPeerDisabledAlert(true);
  }, [assignmentId, nbgraderEnabled, peerEnabled]);

  async function refreshHasFiles() {
    if (unitDeleted || project_id == null || unitPath == null) return;
    try {
      const { files } = await webapp_client.project_client.directory_listing({
        project_id,
        path: unitPath,
        hidden: false,
        compute_server_id: 0,
      });
      setHasFiles((files?.length ?? 0) > 0);
    } catch (_err) {
      // Keep previous state if listing fails (e.g. permissions/temporary issues).
    }
  }

  useEffect(() => {
    setHasFiles(initialHasFiles);
  }, [unitId, initialHasFiles]);

  useEffect(() => {
    if (unitDeleted) return;
    void refreshHasFiles();
    const onFocus = () => {
      void refreshHasFiles();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [project_id, unitPath, unitId, unitDeleted]);

  useEffect(() => {
    if (unitDeleted || hasFiles !== false) return;
    const id = window.setInterval(() => {
      void refreshHasFiles();
    }, 3000);
    return () => window.clearInterval(id);
  }, [hasFiles, project_id, unitPath, unitId, unitDeleted]);

  function getStore(): CourseStore {
    const store = redux.getStore(name);
    if (store == null) throw Error("store must be defined");
    return store as unknown as CourseStore;
  }

  const store = getStore();
  let controlsNode: ReactNode = null;
  let warningNode: ReactNode = null;
  let runAllNode: ReactNode = null;
  let bodyNode: ReactNode = null;
  let saveNote: (value: string) => void;
  const noContent = noContentMessages(intl, unitLabel);

  function renderNoContentWarning(
    onOpenUnitPath: (e?: MouseEvent<HTMLElement>) => void,
  ): ReactNode {
    if (unitDeleted || hasFiles !== false) return null;
    return (
      <Alert
        type="warning"
        showIcon
        style={{ margin: "15px auto", maxWidth: "800px" }}
        message={noContent.message}
        description={noContent.description((chunks) => (
          <a onClick={onOpenUnitPath}>{chunks}</a>
        ))}
      />
    );
  }

  function renderPrivateNotes(): ReactNode {
    const { title, tip, placeholder } = noteMessages(intl, unitLabel);
    return (
      <PrivateNotes
        title={title}
        tip={tip}
        value={noteValue}
        onSave={saveNote}
        placeholder={placeholder}
        persistId={unitId}
      />
    );
  }

  if (assignment) {
    const assignmentProps = props as CourseUnitCardAssignmentProps;
    const openUnitPath = (e?: MouseEvent<HTMLElement>) => {
      e?.preventDefault();
      return redux
        .getProjectActions(project_id)
        .open_directory(assignment.get("path"));
    };

    controlsNode = (
      <CourseUnitControls
        unit={assignment}
        actions={actions}
        onOpenUnitPath={openUnitPath}
        expandPeerConfig={assignmentProps.expand_peer_config}
        showPeerDisabledAlert={showPeerDisabledAlert}
        setShowPeerDisabledAlert={setShowPeerDisabledAlert}
      />
    );
    warningNode = renderNoContentWarning(openUnitPath);
    // Intentional: the full assignment workflow (action buttons, student list) is
    // rendered even when the directory has no files yet.  Assigning an empty folder
    // still creates the student directory and writes the due-date file, so the
    // instructor can set up the roster/due-dates first and add content later.
    // A warning banner (warningNode above) is shown, but the actions are not blocked.
    runAllNode = (
      <AssignmentHeader
        assignment={assignment}
        status={store.get_assignment_status(assignmentId) ?? null}
        numStudents={store.num_students()}
        actions={actions}
        studentSearch={studentSearch}
        setStudentSearch={setStudentSearch}
        nbgraderRunInfo={assignmentProps.nbgrader_run_info}
      />
    );
    bodyNode = (
      <StudentListForAssignment
        redux={redux}
        frame_id={frame_id}
        name={name}
        assignment={assignment}
        students={students}
        user_map={user_map}
        active_feedback_edits={assignmentProps.active_feedback_edits}
        nbgrader_run_info={assignmentProps.nbgrader_run_info}
        search={studentSearch}
      />
    );

    saveNote = (value) =>
      actions.assignments.set_assignment_note(assignmentId, value);
  } else {
    const handout = unit as HandoutRecord;
    const status =
      store.get_handout_status(handout.get("handout_id")) ??
      ({ handout: 0, not_handout: 0 } as HandoutStatus);
    const openUnitPath = (e?: MouseEvent<HTMLElement>) => {
      e?.preventDefault();
      return redux
        .getProjectActions(project_id)
        .open_directory(handout.get("path"));
    };

    controlsNode = (
      <CourseUnitControls
        unit={handout}
        actions={actions}
        onOpenUnitPath={openUnitPath}
      />
    );
    warningNode = renderNoContentWarning(openUnitPath);
    runAllNode = (
      <HandoutHeader
        handout={handout}
        status={status}
        numStudents={store.num_students()}
        actions={actions}
        studentSearch={studentSearch}
        setStudentSearch={setStudentSearch}
      />
    );
    bodyNode = (
      <StudentListForHandout
        frame_id={frame_id}
        handout={handout}
        students={students}
        user_map={user_map}
        actions={actions}
        name={name}
        search={studentSearch}
      />
    );

    saveNote = (value) => actions.handouts.set_handout_note(unitId, value);
  }

  return (
    <ConfigProvider componentSize={size}>
      <Card>
        <Space direction="vertical" style={{ width: "100%" }}>
          {controlsNode}
          {renderPrivateNotes()}
          <Divider style={{ borderTopWidth: 3, margin: 0 }} />
          {warningNode}
          {runAllNode}
          {bodyNode}
        </Space>
      </Card>
    </ConfigProvider>
  );
}
