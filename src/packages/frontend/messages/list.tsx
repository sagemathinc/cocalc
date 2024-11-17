import { useMemo } from "react";
import { Spin } from "antd";
import type { Message } from "@cocalc/util/db-schema/messages";

export default function MessagesList({ messages, filter }) {
  const filteredMessages: null | Message[] = useMemo(() => {
    if (messages == null) {
      return null;
    }
    let m;
    if (filter == "messages-read") {
      m = messages.filter(isRead);
    } else if (filter == "messages-saved") {
      m = messages.filter(({ saved }) => saved);
    } else if (filter == "messages-unread") {
      m = messages.filter((message) => !isRead(message));
    } else if (filter == "messages-all") {
      m = messages;
    } else {
      m = messages;
    }
    return m.valueSeq().toJS();
  }, [filter, messages]);

  if (messages == null) {
    return <Spin />;
  }
  return (
    <pre>
      {filter}
      ---
      {JSON.stringify(filteredMessages, undefined, 2)}
    </pre>
  );
}

function isRead(message) {
  return message.get("read")?.valueOf();
}
