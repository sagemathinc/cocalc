import { useMemo } from "react";
import { Spin } from "antd";

export default function MessagesList({ messages, filter }) {
  const filteredMessages = useMemo(() => {
    if (messages == null) {
      return null;
    }
    if (filter == "messages-read") {
      return messages.filter(({ read }) => !!read);
    }
    if (filter == "messages-saved") {
      return messages.filter(({ saved }) => saved);
    }
    if (filter == "messages-unread") {
      return messages.filter(({ read }) => !read);
    }
    if (filter == "messages-all") {
      return messages;
    }
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
