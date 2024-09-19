import { Alert, Modal } from "antd";
import type { StudentsMap } from "./store";
import type { UserMap } from "@cocalc/frontend/todo-types";
import AddStudents from "@cocalc/frontend/course/students/add-students";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  ReconfigureAllProjects,
  StartAllProjects,
  ExportGrades,
  ResendInvites,
  CopyMissingHandoutsAndAssignments,
} from "@cocalc/frontend/course/configuration/actions-panel";
import type { ProjectMap } from "@cocalc/frontend/todo-types";
import { TerminalCommandPanel } from "@cocalc/frontend/course/configuration/terminal-command";
import EmptyTrash from "@cocalc/frontend/course/configuration/empty-trash";
import { DeleteAllStudentProjects } from "@cocalc/frontend/course/configuration//delete-all-student-projects";
import { DeleteAllStudents } from "@cocalc/frontend/course/configuration//delete-all-students";
import { DeleteSharedProjectPanel } from "@cocalc/frontend/course/shared-project/delete-shared-project";
import { SharedProjectPanel } from "@cocalc/frontend/course/shared-project/shared-project-panel";

interface Props {
  frameActions;
  actions;
  modal?: string;
  name: string;
  students?: StudentsMap;
  user_map?: UserMap;
  project_map?: ProjectMap;
  project_id;
  configuring_projects?: boolean;
  reinviting_students?: boolean;
  settings;
  redux;
}

export default function Modals(props: Props) {
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
            {icon && <Icon name={icon} />} {title}
          </>
        ) : undefined
      }
      width={800}
    >
      <Body
        {...props}
        students={students}
        user_map={user_map}
        project_map={project_map}
        close={close}
      />
    </Modal>
  );
  return null;
}

function getModal(modal: string) {
  switch (modal) {
    case "add-students":
      return { Body: AddStudents, title: "Add Students", icon: "users" };

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
