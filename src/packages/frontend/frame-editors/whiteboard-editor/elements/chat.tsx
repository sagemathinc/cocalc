import { useEffect, useRef, useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { Element } from "../types";
import { getStyle } from "./text";
import { useFrameContext } from "../hooks";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { Button, Comment, Tooltip } from "antd";
import { len, trunc_middle } from "@cocalc/util/misc";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import useEditFocus from "./edit-focus";
import { useDebouncedCallback } from "use-debounce";

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
  const [input, setInput] = useState<string>(
    element.data?.[redux.getStore("account").get_account_id()]?.input ?? ""
  );
  const [editFocus, setEditFocus] = useEditFocus(!!focused);

  const ignoreNextChangeRef = useRef<boolean>(false);
  const saveChat = useDebouncedCallback((input) => {
    if (ignoreNextChangeRef.current) {
      ignoreNextChangeRef.current = false;
      return;
    }
    actions.saveChat({ id: element.id, input });
  }, 1500);

  // When the component goes to be unmounted, we will fetch data if the input has changed.
  useEffect(
    () => () => {
      saveChat.flush();
    },
    [saveChat]
  );

  return (
    <div style={getChatStyle(element)}>
      <ChatLog
        Message={Message}
        element={element}
        style={{ flex: 1, overflowY: "auto", background: "white" }}
      />
      {(focused || len(element.data) === 0) && (
        <div
          style={{ height: "125px", display: "flex" }}
          className={editFocus ? "nodrag" : undefined}
          onClick={() => {
            if (!editFocus) setEditFocus(true);
          }}
        >
          <MultiMarkdownInput
            onFocus={() => {
              setEditFocus(true);
            }}
            onBlur={() => {
              setEditFocus(false);
            }}
            isFocused={editFocus}
            cacheId={element.id}
            hideHelp
            height={"123px"}
            value={input}
            onChange={(input) => {
              setInput(input);
              saveChat(input);
            }}
            onShiftEnter={(input) => {
              ignoreNextChangeRef.current = true;
              actions.sendChat({ id: element.id, input });
              setInput("");
            }}
            style={{ flex: 1 }}
          />
          <Tooltip title="Send message (shift+enter)">
            <Button
              disabled={!input.trim()}
              type="primary"
              style={{ height: "100%", marginLeft: "5px" }}
              onClick={() => {
                actions.sendChat({ id: element.id, input });
                setInput("");
              }}
            >
              Send
            </Button>
          </Tooltip>
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
