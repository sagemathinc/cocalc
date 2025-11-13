import { TimeAgo } from "@cocalc/frontend/components";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import { ChatMessageTyped } from "./types";

interface Props {
  message: ChatMessageTyped;
  edit: (event) => void;
}

export function Time({ message, edit }: Props) {
  // We make click on the timestamp edit the chat since onDoubleClick is completely
  // ignored on mobile touch devices...
  return (
    <span
      onClick={IS_TOUCH && edit != null ? edit : undefined}
      className="pull-right small"
      style={{
        maxWidth: "20%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
      }}
    >
      <TimeAgo date={new Date(message.get("date"))} />
    </span>
  );
}
