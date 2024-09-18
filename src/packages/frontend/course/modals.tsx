import { Alert, Modal } from "antd";
import type { StudentsMap } from "./store";
import type { UserMap } from "@cocalc/frontend/todo-types";
import AddStudents from "@cocalc/frontend/course/students/add-students";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  actions;
  modal?: string;
  name: string;
  students?: StudentsMap;
  user_map?: UserMap;
  project_id;
}

export default function Modals(props: Props) {
  const { students, user_map, modal } = props;
  if (students == null || user_map == null || !modal) {
    return null;
  }
  const close = () => {
    props.actions.setState({ modal: "" });
  };
  if (modal == "add-students") {
    return (
      <Modal
        onCancel={close}
        onOk={close}
        cancelButtonProps={{ style: { display: "none" } }}
        okText="Close"
        open
        title={
          <>
            <Icon name="users" /> Add Students
          </>
        }
        width={800}
      >
        <AddStudents {...props} students={students} user_map={user_map} />
      </Modal>
    );
  } else {
    return (
      <Alert type="warning" message={<>BUG -- Unknown modal: {modal}</>} />
    );
  }
  return null;
}
