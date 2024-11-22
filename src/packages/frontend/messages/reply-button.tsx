import { Button, Modal } from "antd";
import Compose from "./compose";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function ReplyButton({ label = "Reply", replyTo, ...props }) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      {!open && (
        <Button {...props} onClick={() => setOpen(true)}>
          <Icon name="reply" />
          {label ? <> {label}</> : undefined}
        </Button>
      )}
      {open && (
        <Modal
          open
          footer={[]}
          styles={{ content: { maxWidth: "1000px", margin: "auto" } }}
          width={"85%"}
          onCancel={() => {
            setOpen(false);
          }}
          onOk={() => {
            setOpen(false);
          }}
        >
          <Compose
            style={{ marginBottom: "15px" }}
            replyTo={replyTo}
            onCancel={() => setOpen(false)}
            onSend={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
