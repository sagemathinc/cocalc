import { Button } from "antd";
import Compose from "./compose";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function ReplyButton({ replyTo, ...props }) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      {!open && (
        <Button {...props} onClick={() => setOpen(true)}>
          <Icon name="reply" /> Reply
        </Button>
      )}
      {open && (
        <Compose
          title="Compose Reply"
          replyTo={replyTo}
          onCancel={() => setOpen(false)}
          onSend={() => setOpen(false)}
        />
      )}
    </>
  );
}
