import { React } from "../app-framework";
import { Message } from "./types";
import { IS_TOUCH } from "../feature";
import { TimeAgo } from "../r_misc";

export const Time: React.FC<{ message: Message; edit: (event) => void }> = ({
  message,
  edit,
}) => {
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
};
