import { Alert, Modal } from "antd";
import type { StudentsMap } from "./store";
import type { UserMap } from "@cocalc/frontend/todo-types";
import AddStudents from "@cocalc/frontend/course/students/add-students";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  ReconfigureAllProjects,
  StartAllProjects,
} from "@cocalc/frontend/course/configuration/actions-panel";
import type { ProjectMap } from "@cocalc/frontend/todo-types";

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
    case "reconfigure-all-projects":
      return {
        Body: ReconfigureAllProjects,
      };
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
