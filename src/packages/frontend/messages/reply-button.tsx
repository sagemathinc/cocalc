import { Button, Spin, Tooltip, type ButtonProps } from "antd";
import { useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
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
  const intl = useIntl();
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

  // Draft a reply to the sender ${replyAll ? "everybody in this thread" : ""}
  const title = intl.formatMessage(
    {
      id: "messages.reply-button.tooltip",
      defaultMessage: `Draft a reply to {replyAll, select, true {everybody in this thread} other {the sender}}`,
    },
    { replyAll },
  );

  const labelText = intl.formatMessage(
    {
      id: "messages.reply-button.label",
      defaultMessage: "Reply {replyAll, select, true {All} other {}}",
    },
    { replyAll },
  );

  return (
    <Tooltip title={title}>
      <Button {...props} onClick={() => createReply()} disabled={creating}>
        <Icon name="reply" style={{ color: "darkgreen" }} />
        {replyAll ? (
          <Icon
            name="reply"
            style={{ marginLeft: "-15px", color: "darkgreen" }}
          />
        ) : undefined}
        {label ?? labelText}
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
  const intl = useIntl();
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

  const title = intl.formatMessage(
    {
      id: "messages.forward-button.tooltip",
      defaultMessage:
        "Forward {forwardAll, select, true {entire thread} other {this message}}",
    },
    { forwardAll },
  );

  const labelText = intl.formatMessage(
    {
      id: "messages.forward-button.label",
      defaultMessage: "Forward {forwardAll, select, true {Thread} other {}}",
    },
    { forwardAll },
  );

  return (
    <Tooltip title={title}>
      <Button {...props} onClick={() => createForward()} disabled={creating}>
        <Icon
          name={forwardAll ? "forward" : "step-forward"}
          style={{ fontSize: "20px", color: "darkblue" }}
        />
        {label ?? labelText}
        {creating && <Spin delay={1000} style={{ marginLeft: "15px" }} />}
      </Button>
    </Tooltip>
  );
}
