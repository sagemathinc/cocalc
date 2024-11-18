import { useMemo, useState } from "react";
import { Button, Flex, List, Space, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp, get_array_range } from "@cocalc/util/misc";
import Compose from "./compose";
import Message from "./message";
import { Icon } from "@cocalc/frontend/components/icon";

export default function MessagesList({ messages, sentMessages, filter }) {
  const [showBody, setShowBody] = useState<Set<number>>(new Set());
  const [checkedMessageIds, setCheckedMessageIds] = useState<Set<number>>(
    new Set(),
  );
  const [mostRecentChecked, setMostRecentChecked] = useState<number | null>(
    null,
  );

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
    const v = m.valueSeq().toJS().sort(field_cmp("created")).reverse();

    if (checkedMessageIds.size > 0) {
      let changed = false;
      const messageIds = new Set(v.map(({ id }) => id));
      for (const id of checkedMessageIds) {
        if (!messageIds.has(id)) {
          checkedMessageIds.delete(id);
          changed = true;
        }
      }
      if (changed) {
        setCheckedMessageIds(new Set(checkedMessageIds));
      }
    }

    return v;
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
      <Flex style={{ marginBottom: "5px", height: "32px" }}>
        <Icon
          onClick={() => {
            if (checkedMessageIds.size == 0) {
              setCheckedMessageIds(
                new Set(filteredMessages.map(({ id }) => id)),
              );
            } else {
              setCheckedMessageIds(new Set());
            }
          }}
          name={
            checkedMessageIds.size == 0
              ? "square"
              : checkedMessageIds.size == filteredMessages.length
                ? "check-square"
                : "minus-square"
          }
          style={{
            fontSize: "14pt",
            color: "#666",
            marginLeft: "24px",
            marginRight: "30px",
          }}
        />
        {checkedMessageIds.size > 0 && (
          <Space>
            <Button type="text" disabled={filter != "messages-inbox"}>
              <Icon name="download" /> Archive
            </Button>
            <Button type="text">
              <Icon name="trash" /> Delete
            </Button>
            <Button type="text" disabled={filter != "messages-sent"}>
              <Icon name="eye-slash" /> Mark Unread
            </Button>
            <Button type="text" disabled={filter != "messages-all"}>
              <Icon name="mail" /> Move to Inbox
            </Button>
          </Space>
        )}
      </Flex>
      <List
        bordered
        dataSource={filteredMessages}
        renderItem={(message) => (
          <List.Item style={{ background: "#f8f8f8" }}>
            <Message
              checked={checkedMessageIds.has(message.id)}
              setChecked={({ checked, shiftKey }) => {
                if (shiftKey && mostRecentChecked != null) {
                  // set the range of id's between this message and the most recent one
                  // to be checked.  This matches the algorithm I think in gmail and our file explorer.
                  const v = get_array_range(
                    filteredMessages.map(({ id }) => id),
                    mostRecentChecked,
                    message.id,
                  );
                  if (checked) {
                    for (const id of v) {
                      checkedMessageIds.add(id);
                    }
                  } else {
                    for (const id of v) {
                      checkedMessageIds.delete(id);
                    }
                  }
                } else {
                  if (checked) {
                    checkedMessageIds.add(message.id);
                  } else {
                    checkedMessageIds.delete(message.id);
                  }
                }
                setCheckedMessageIds(new Set(checkedMessageIds));
                setMostRecentChecked(message.id);
              }}
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
