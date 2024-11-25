import { Button, Spin, type ButtonProps } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import type { Message } from "./types";

interface ReplyButtonProps extends ButtonProps {
  label?;
  replyTo: Message;
}

export default function ReplyButton({
  label = "Reply",
  replyTo,
  ...props
}: ReplyButtonProps) {
  const [creating, setCreating] = useState<boolean>(false);

  const createReply = useMemo(
    () => async () => {
      const actions = redux.getActions("messages");
      try {
        setCreating(true);
        await actions.createReply(replyTo);
      } catch (err) {
        actions.setError(`${err}`);
      } finally {
        setCreating(false);
      }
    },
    [replyTo],
  );

  return (
    <Button {...props} onClick={() => createReply()} disabled={creating}>
      <Icon name="reply" />
      {label}
      {creating && <Spin delay={1500} style={{ marginLeft: "15px" }} />}
    </Button>
  );
}
