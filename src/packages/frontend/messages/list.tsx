import { useMemo } from "react";
import { Flex, List, Spin, Input, Space } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp, plural } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { User } from "@cocalc/frontend/users";

export default function MessagesList({ messages, sentMessages, filter }) {
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
    return (
      <div>
        <h3 style={{ marginBottom: "15px" }}>Write a message</h3>
        <Space direction="vertical" style={{width:'100%'}}>
          <Input placeholder="To" />
          <Input placeholder="Subject" />
          <Input.TextArea rows={10} placeholder="Body..." />
        </Space>
      </div>
    );
  }

  return (
    <>
      {filter == "messages-all" ? (
        <h3 style={{ marginBottom: "15px" }}>All Messages</h3>
      ) : (
        <h3 style={{ marginBottom: "15px" }}>
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
              <div style={{ width: "50px" }}>{message.id}</div>
              <div style={{ flex: 0.8 }}>
                {isRead(message) ? message.subject : <b>{message.subject}</b>}
              </div>
              <div style={{ flex: 0.2 }} />
              <User
                account_id={
                  filter == "messages-sent" ? message.to_id : message.from_id
                }
                show_avatar
                avatarSize={20}
              />
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

export function isRead(message: MessageType) {
  return !!message.read?.valueOf();
}
