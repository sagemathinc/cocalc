import { ReactNode, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { Element } from "../types";
import { getStyle } from "./text";
import { ChatInput } from "@cocalc/frontend/chat/input";
import { useFrameContext } from "../hooks";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { Comment } from "antd";
import { cmp, trunc_middle } from "@cocalc/util/misc";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function IconElt({ element, focused }: Props) {
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
    <div
      style={{
        padding: "5px",
        margin: "0 30px 30px 30px",
        background: "white",
        height: `${element.h - 60}px`,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        border: `2px solid ${element.data?.color ?? "#ccc"}`,
        borderRadius: "5px",
        boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
      }}
    >
      <ChatLog
        element={element}
        style={{ flex: 1, overflowY: "auto", background: "white" }}
      />
      <div style={{ height: focused ? "125px" : "50px" }} className="nodrag">
        <ChatInput
          hideHelp
          height={focused ? "123px" : "48px"}
          input={input}
          onChange={setInput}
          on_send={() => {
            actions.sendChat({ id: element.id, input });
            setInput("");
          }}
        />
      </div>
    </div>
  );
}

function ChatLog({ element, style }) {
  const divRef = useRef(null);
  useEffect(() => {
    const elt = ReactDOM.findDOMNode(divRef.current) as any;
    if (elt) {
      elt.scrollTop = elt.scrollHeight;
    }
  }, [element.data]);
  const v: ReactNode[] = [];
  for (const n of messageNumbers(element)) {
    v.push(<Message key={n} element={element} messageNumber={n} />);
  }
  return (
    <div className="nodrag" ref={divRef} style={style}>
      {v}
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
  const { input, sender_id, time } = element.data?.[messageNumber] ?? {};
  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "5px",
        margin: "5px 0",
        padding: "5px 15px",
      }}
    >
      <Comment
        author={sender_id ? getName(sender_id) : undefined}
        avatar={sender_id ? <Avatar account_id={sender_id} /> : undefined}
        content={<StaticMarkdown value={input ?? ""} />}
        datetime={<TimeAgo date={time} />}
      />
    </div>
  );
}

function getName(account_id: string) {
  return trunc_middle(redux.getStore("users").get_name(account_id)?.trim(), 20);
}

export function lastMessageNumber(element: Element): number {
  let n = -1;
  for (const field in element.data ?? {}) {
    const k = parseInt(field);
    if (!isNaN(k)) {
      n = Math.max(n, k);
    }
  }
  return n;
}

export function messageNumbers(element: Element): number[] {
  const v: number[] = [];
  for (const field in element.data ?? {}) {
    const k = parseInt(field);
    if (!isNaN(k)) {
      v.push(k);
    }
  }
  v.sort(cmp);
  return v;
}
