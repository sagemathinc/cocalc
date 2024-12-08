import { Button, Spin, type ButtonProps, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import type { Message } from "./types";
import useCommand from "./use-command";

interface ReplyButtonProps extends ButtonProps {
  label?;
  replyTo: Message;
  replyAll?: boolean;
  focused?: boolean;
}

export default function ReplyButton({
  label,
  replyTo,
  replyAll,
  focused,
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

  useCommand({
    reply: () => {
      if (focused && !replyAll) {
        createReply();
      }
    },
    ["reply-all"]: () => {
      if (focused && replyAll) {
        createReply();
      }
    },
  });

  return (
    <Tooltip
      title={`Draft a reply to the sender ${replyAll ? "everybody in this thread" : ""}`}
    >
      <Button {...props} onClick={() => createReply()} disabled={creating}>
        <Icon name="reply" style={{ color: "darkgreen" }} />
        {replyAll ? (
          <Icon
            name="reply"
            style={{ marginLeft: "-15px", color: "darkgreen" }}
          />
        ) : undefined}
        {label ?? `Reply ${replyAll ? "All" : ""}`}
        {creating && <Spin delay={1000} style={{ marginLeft: "15px" }} />}
      </Button>
    </Tooltip>
  );
}

export function ForwardButton({
  label,
  replyTo,
  replyAll: forwardAll,
  focused,
  ...props
}: ReplyButtonProps) {
  const [creating, setCreating] = useState<boolean>(false);

  const createForward = useMemo(
    () => async () => {
      const actions = redux.getActions("messages");
      try {
        setCreating(true);
        await actions.createForward({
          message: replyTo,
          forwardAll: forwardAll,
        });
      } catch (err) {
        actions.setError(`${err}`);
      } finally {
        setCreating(false);
      }
    },
    [replyTo],
  );

  useCommand({
    forward: () => {
      if (focused) {
        createForward();
      }
    },
  });

  return (
    <Tooltip title={`Forward ${forwardAll ? "entire thread" : "this message"}`}>
      <Button {...props} onClick={() => createForward()} disabled={creating}>
        <Icon
          name={forwardAll ? "forward" : "step-forward"}
          style={{ fontSize: "20px", color: "darkblue" }}
        />
        {label ?? `Forward ${forwardAll ? "Thread" : ""}`}
        {creating && <Spin delay={1000} style={{ marginLeft: "15px" }} />}
      </Button>
    </Tooltip>
  );
}
