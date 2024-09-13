import { Button, Modal, Popconfirm } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function DeletedAccount({
  actions,
  student_id,
  name,
  email_address,
}) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <span style={{ color: "#666" }}>
      <Modal
        centered
        title={
          <>
            <Icon name="trash" /> {name ?? "This Student"} Deleted their CoCalc
            Account
          </>
        }
        open={open}
        onCancel={() => setOpen(false)}
      >
        <p>
          Your student {name} {email_address} deleted their Cocalc account. They
          may have created a new CoCalc account, left the course, or something
          else. You can leave things as is, or you can delete them entirely from
          this course. If they want to be in the course, delete them below, then
          add them back to the course as usual.
        </p>
        <p>
          If you delete the student, any grades you recorded for them will also
          be deleted.
        </p>
        <div style={{ margin: "10px 0", textAlign: "center" }}>
          <Popconfirm
            title={<>Completely delete {name} from your course?</>}
            onConfirm={async () => {
              await actions.students.delete_student(student_id, true);
              setOpen(false);
            }}
            okText={"DELETE"}
          >
            <Button danger>Delete {name}...</Button>
          </Popconfirm>
        </div>
      </Modal>
      <a
        onClick={() => {
          setOpen(true);
        }}
      >
        (they deleted their account...)
      </a>
    </span>
  );
}
