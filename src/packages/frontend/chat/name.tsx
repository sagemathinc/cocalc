import { React } from "../app-framework";
import { CHAT_SECONDARY_TEXT } from "./chat-colors";

const STYLE: React.CSSProperties = {
  color: CHAT_SECONDARY_TEXT,
  marginBottom: "1px",
  marginLeft: "10px",
  right: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis", // see https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
  position: "absolute", // using the "absolute in relative" positioning trick
  left: 0,
  top: 0,
};

export const Name: React.FC<{ sender_name: string }> = ({ sender_name }) => {
  return (
    <div style={{ position: "relative", height: "1.2em", width: "100%" }}>
      <div className={"small"} style={STYLE}>
        {sender_name}
      </div>
    </div>
  );
};
