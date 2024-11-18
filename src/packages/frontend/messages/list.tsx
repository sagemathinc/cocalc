import { useMemo, useState } from "react";
import { List, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp } from "@cocalc/util/misc";
import Compose from "./compose";
import Message from "./message";

export default function MessagesList({ messages, sentMessages, filter }) {
  const [showBody, setShowBody] = useState<Set<number>>(new Set());

  const filteredMessages: MessageType[] = useMemo(() => {
    if (messages == null || filter == "message-compose") {
      return [];
    }
    let m;
    if (filter == "messages-inbox") {
      m = messages.filter((message) => !message.get("saved"));
    } else if (filter == "messages-all") {
      m = messages;
    } else if (filter == "messages-sent") {
      m = sentMessages ?? [];
    } else {
      m = messages;
    }
    return m.valueSeq().toJS().sort(field_cmp("created")).reverse();
  }, [filter, messages, sentMessages]);

  if (messages == null) {
    return <Spin />;
  }

  if (filter == "messages-compose") {
    return <Compose />;
  }

  return (
    <>
      <h3 style={{ marginBottom: "15px" }}>
        {capitalize(filter?.split("-")[1])} ({filteredMessages.length})
      </h3>
      <List
        bordered
        dataSource={filteredMessages}
        renderItem={(message) => (
          <List.Item style={{ background: "#f8f8f8" }}>
            <Message
              message={message}
              showBody={showBody}
              setShowBody={setShowBody}
              filter={filter}
            />
          </List.Item>
        )}
      />
    </>
  );
}
