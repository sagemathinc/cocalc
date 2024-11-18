import { useMemo, useState } from "react";
import { Card, Checkbox, Flex, List, Space, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { User } from "@cocalc/frontend/users";
import Compose from "./compose";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function MessagesList({ messages, sentMessages, filter }) {
  const [visible, setVisible] = useState<Set<number>>(new Set());

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
          <List.Item>
            <Space
              direction="vertical"
              style={{ width: "100%", marginBottom: "-10px" }}
            >
              <Flex style={{ width: "100%" }}>
                {filter != "messages-sent" && (
                  <Checkbox
                    style={{ marginRight: "15px" }}
                    checked={message.saved}
                    onChange={(e) => {
                      redux.getActions("messages").mark({
                        id: message.id,
                        saved: e.target.checked,
                      });
                    }}
                  />
                )}
                <div
                  style={{ flex: 0.8, cursor: "pointer" }}
                  onClick={() => {
                    if (visible.has(message.id)) {
                      visible.delete(message.id);
                    } else {
                      visible.add(message.id);
                      if (filter != "messages-sent" && !message.read) {
                        redux.getActions("messages").mark({
                          id: message.id,
                          read: webapp_client.server_time(),
                        });
                      }
                    }
                    // should use immutable js but I'm lazy and not big.
                    setVisible(new Set(visible));
                  }}
                >
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
                {/*<div style={{ width: "50px", color: "#888", textAlign: "right" }}>
                {message.id}
              </div>*/}
              </Flex>
              <div>
                {visible.has(message.id) && (
                  <Card style={{ margin: "30px" }}>
                    <StaticMarkdown value={message.body} />
                  </Card>
                )}
              </div>
            </Space>
          </List.Item>
        )}
      />
    </>
  );
}

export function isRead(message: MessageType) {
  return !!message.read?.valueOf();
}
