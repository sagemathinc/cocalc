import { useState } from "react";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { Element } from "../types";
import { getStyle } from "./text";
import { ChatInput } from "@cocalc/frontend/chat/input";
import { useFrameContext } from "../hooks";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { Comment } from "antd";
import { trunc_middle } from "@cocalc/util/misc";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { redux } from "@cocalc/frontend/app-framework";

import { ChatLog, getChatStyle, messageStyle } from "./chat-static";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function ChatDynamic({ element, focused }: Props) {
  return (
    <>
      <Icon
        name={"comment"}
        style={getStyle(element, { fontSize: 24, background: "white" })}
      />
      <Conversation element={element} focused={focused} />
    </>
  );
}

function Conversation({ element, focused }: Props) {
  const { actions } = useFrameContext();
  const [input, setInput] = useState<string>("");

  return (
    <div style={getChatStyle(element)}>
      <ChatLog
        Message={Message}
        element={element}
        style={{ flex: 1, overflowY: "auto", background: "white" }}
      />
      {focused && (
        <div style={{ height: "125px" }} className="nodrag">
          <ChatInput
            hideHelp
            height={"123px"}
            input={input}
            onChange={setInput}
            on_send={() => {
              actions.sendChat({ id: element.id, input });
              setInput("");
            }}
          />
        </div>
      )}
    </div>
  );
}

function Message({
  element,
  messageNumber,
}: {
  element: Element;
  messageNumber: number;
}) {
  const { input, sender_id, sender_name, time } =
    element.data?.[messageNumber] ?? {};
  return (
    <div style={messageStyle}>
      <Comment
        author={sender_id ? getName(sender_id) ?? sender_name : undefined}
        avatar={sender_id ? <Avatar account_id={sender_id} /> : undefined}
        content={<StaticMarkdown value={input ?? ""} />}
        datetime={<TimeAgo date={time} />}
      />
    </div>
  );
}

export function getName(account_id: string): undefined | string {
  const name = redux.getStore("users").get_name(account_id)?.trim();
  if (!name) return undefined;
  return trunc_middle(name, 20);
}
