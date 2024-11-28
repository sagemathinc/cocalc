import { Button, Spin, type ButtonProps, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import type { Message } from "./types";

interface ReplyButtonProps extends ButtonProps {
  label?;
  replyTo: Message;
  replyAll?: boolean | string[];
}

export default function ReplyButton({
  label,
  replyTo,
  replyAll,
  ...props
}: ReplyButtonProps) {
  const [creating, setCreating] = useState<boolean>(false);

  const createReply = useMemo(
    () => async () => {
      const actions = redux.getActions("messages");
      try {
        setCreating(true);
        await actions.createReply({ message: replyTo, replyAll });
      } catch (err) {
        actions.setError(`${err}`);
      } finally {
        setCreating(false);
      }
    },
    [replyTo],
  );

  return (
    <Tooltip
      title={`Send a reply to the sender ${replyAll ? "and all recipients in this thread" : ""}`}
    >
      <Button {...props} onClick={() => createReply()} disabled={creating}>
        <Icon name="reply" />
        {replyAll ? (
          <Icon name="reply" style={{ marginLeft: "-15px" }} />
        ) : undefined}
        {label ?? `Reply ${replyAll ? "All" : ""}`}
        {creating && <Spin delay={1500} style={{ marginLeft: "15px" }} />}
      </Button>
    </Tooltip>
  );
}
