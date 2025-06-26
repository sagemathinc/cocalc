/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Modal } from "antd";
import { useIntl } from "react-intl";

import { AppRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { AddAssignments } from "@cocalc/frontend/course/assignments/assignments-panel";
import { COMMANDS } from "@cocalc/frontend/course/commands";
import { DeleteAllStudentProjects } from "@cocalc/frontend/course/configuration//delete-all-student-projects";
import { DeleteAllStudents } from "@cocalc/frontend/course/configuration//delete-all-students";
import {
  CopyMissingHandoutsAndAssignments,
  ExportGrades,
  ReconfigureAllProjects,
  ResendInvites,
  StartAllProjects,
} from "@cocalc/frontend/course/configuration/actions-panel";
import ConfigurationCopying from "@cocalc/frontend/course/configuration/configuration-copying";
import {
  CollaboratorPolicy,
  ConfigureSoftwareEnvironment,
  EmailInvitation,
  EnvVariables,
  NetworkFilesystem,
  RestrictStudentProjects,
  TitleAndDescription,
  UpgradeConfiguration,
} from "@cocalc/frontend/course/configuration/configuration-panel";
import EmptyTrash from "@cocalc/frontend/course/configuration/empty-trash";
import { Nbgrader } from "@cocalc/frontend/course/configuration/nbgrader";
import { Parallel } from "@cocalc/frontend/course/configuration/parallel";
import { TerminalCommandPanel } from "@cocalc/frontend/course/configuration/terminal-command";
import { AddHandouts } from "@cocalc/frontend/course/handouts/handouts-panel";
import { DeleteSharedProjectPanel } from "@cocalc/frontend/course/shared-project/delete-shared-project";
import { SharedProjectPanel } from "@cocalc/frontend/course/shared-project/shared-project-panel";
import AddStudents from "@cocalc/frontend/course/students/add-students";
import { course, IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import type { ProjectMap, UserMap } from "@cocalc/frontend/todo-types";
import { CourseEditorActions } from "../frame-editors/course-editor/actions";
import { CourseActions } from "./actions";
import type { CourseSettingsRecord, StudentsMap } from "./store";

interface Props {
  frameActions: CourseEditorActions;
  actions: CourseActions;
  modal?: string;
  name: string;
  students?: StudentsMap;
  user_map?: UserMap;
  project_map?: ProjectMap;
  project_id: string;
  path: string;
  configuring_projects?: boolean;
  reinviting_students?: boolean;
  settings?: CourseSettingsRecord;
  redux: AppRedux;
}

export default function Modals(props: Props) {
  const intl = useIntl();
  const { students, user_map, project_map, modal } = props;
  if (students == null || user_map == null || project_map == null || !modal) {
    return null;
  }
  const close = () => {
    props.frameActions.setState({ modal: "" });
  };
  const { title, Body, icon } = getModal(modal);

  return (
    <Modal
      onCancel={close}
      onOk={close}
      cancelButtonProps={{ style: { display: "none" } }}
      okText="Close"
      open
      title={
        title ? (
          <>
            {icon && <Icon name={icon} />}{" "}
            {isIntlMessage(title) ? intl.formatMessage(title) : title}
          </>
        ) : undefined
      }
      width={800}
    >
      <br />
      <Body
        {...props}
        students={students}
        user_map={user_map}
        project_map={project_map}
        close={close}
      />
    </Modal>
  );
}

function getModal(modal: string): {
  Body: (props) => React.JSX.Element;
  title?: string | IntlMessage;
  icon?: IconName;
} {
  const { label: title, icon } = COMMANDS[modal] ?? {};
  switch (modal) {
    case "add-students":
      return { Body: AddStudents, title, icon };
    case "add-assignments":
      return {
        Body: AddAssignments,
        title: course.add_assignments,
        icon: "share-square",
      };
    case "add-handouts":
      return { Body: AddHandouts, title, icon };

    case "start-all-projects":
      return {
        Body: StartAllProjects,
      };

    case "terminal-command":
      return { Body: TerminalCommandPanel };

    case "reconfigure-all-projects":
      return {
        Body: ReconfigureAllProjects,
      };

    case "export-grades":
      return { Body: ExportGrades };

    case "resend-invites":
      return { Body: ResendInvites };

    case "copy-missing-handouts-and-assignments":
      return { Body: CopyMissingHandoutsAndAssignments };

    case "empty-trash":
      return { Body: EmptyTrash };

    case "delete-student-projects":
      return { Body: DeleteAllStudentProjects };

    case "delete-students":
      return { Body: DeleteAllStudents };

    case "delete-shared-project":
      return { Body: DeleteSharedProjectPanel };

    case "create-shared-project":
      return { Body: SharedProjectPanel };

    case "title-and-description":
      return { Body: TitleAndDescription };

    case "email-invitation":
      return { Body: EmailInvitation };
    case "copy-limit":
      return { Body: Parallel };
    case "collaborator-policy":
      return { Body: CollaboratorPolicy };
    case "restrict-student-projects":
      return { Body: RestrictStudentProjects };
    case "nbgrader":
      return { Body: Nbgrader };
    case "network-file-systems":
      return { Body: NetworkFilesystem };
    case "env-variables":
      return { Body: EnvVariables };
    case "upgrades":
      return { Body: UpgradeConfiguration };
    case "software-environment":
      return { Body: ConfigureSoftwareEnvironment };
    case "configuration-copying":
      return { Body: ConfigurationCopying };

    default:
      return {
        Body: () => (
          <Alert type="warning" message={<>BUG -- Unknown modal: {modal}</>} />
        ),
        title: "Error",
        icon: "bug",
      };
  }
}
