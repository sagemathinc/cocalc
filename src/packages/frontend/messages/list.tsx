import { useMemo } from "react";
import { Flex, List, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp, plural } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";

export default function MessagesList({ messages, filter }) {
  const filteredMessages: MessageType[] = useMemo(() => {
    if (messages == null) {
      return [];
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
    return m.valueSeq().toJS().sort(field_cmp("created")).reverse();
  }, [filter, messages]);

  if (messages == null) {
    return <Spin />;
  }
  return (
    <>
      {filter == "messages-all" ? (
        <h3>All Messages</h3>
      ) : (
        <h3>
          {filteredMessages.length} {capitalize(filter?.split("-")[1])}{" "}
          {plural(filteredMessages.length, "Message")}
        </h3>
      )}
      <List
        bordered
        dataSource={filteredMessages}
        renderItem={(message) => (
          <List.Item>
            <Flex style={{ width: "100%" }}>
              <div style={{ flex: 0.8 }}>{message.subject}</div>
              <div style={{ flex: 0.2 }} />
              <TimeAgo
                date={message.created}
                style={{ width: "175px", textAlign: "right" }}
              />
            </Flex>
          </List.Item>
        )}
      />
    </>
  );
}

function isRead(message) {
  return message.get("read")?.valueOf();
}
