import { Button } from "antd";
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
        <Compose
          style={{ marginBottom: "45px", width: "90%" }}
          replyTo={replyTo}
          onCancel={() => setOpen(false)}
          onSend={() => setOpen(false)}
        />
      )}
    </>
  );
}
