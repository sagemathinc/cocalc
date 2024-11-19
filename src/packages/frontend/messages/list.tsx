import { useEffect, useMemo, useState } from "react";
import { Button, Flex, List, Space, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { capitalize, field_cmp, get_array_range } from "@cocalc/util/misc";
import Compose from "./compose";
import Message from "./message";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import dayjs from "dayjs";

export default function MessagesList({ messages, sentMessages, filter }) {
  const [showBody, setShowBody] = useState<number | null>(null);
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
      m = messages.filter(
        (message) => !message.get("saved") && !message.get("deleted"),
      );
    } else if (filter == "messages-all") {
      m = messages.filter((message) => !message.get("deleted"));
    } else if (filter == "messages-sent") {
      m = sentMessages ?? [];
    } else if (filter == "messages-trash") {
      m = messages.filter((message) => message.get("deleted"));
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

  useEffect(() => {
    setCheckedMessageIds(new Set());
    setShowBody(null);
  }, [filter]);

  if (messages == null) {
    return <Spin />;
  }

  if (filter == "messages-compose") {
    return <Compose />;
  }

  const head = (
    <h3 style={{ marginBottom: "15px" }}>
      {capitalize(filter?.split("-")[1])} ({filteredMessages.length})
    </h3>
  );

  if (showBody != null) {
    const id = `${showBody}`;
    return (
      <>
        {head}
        <Flex style={{ marginBottom: "5px" }}>
          <Button
            type="text"
            onClick={() => {
              setShowBody(null);
            }}
          >
            <Icon
              name="left-circle-o"
              style={{ fontSize: "14pt", color: "#666" }}
            />
          </Button>
          {filter != "messages-sent" && (
            <Actions
              filter={filter}
              checkedMessageIds={new Set([showBody])}
              messages={messages}
              setShowBody={setShowBody}
            />
          )}
        </Flex>
        <Message
          message={messages.get(id)?.toJS() ?? sentMessages.get(id)?.toJS()}
          showBody
          setShowBody={setShowBody}
          filter={filter}
        />
      </>
    );
  }

  return (
    <>
      {head}
      {filter != "messages-sent" && (
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
          {checkedMessageIds.size > 0 && filter != "messages-sent" && (
            <Actions
              filter={filter}
              checkedMessageIds={checkedMessageIds}
              messages={messages}
              setShowBody={setShowBody}
            />
          )}
        </Flex>
      )}
      <List
        bordered
        dataSource={filteredMessages}
        renderItem={(message) => (
          <List.Item style={{ background: "#f2f6fc" }}>
            <Message
              checked={checkedMessageIds.has(message.id)}
              setChecked={
                filter != "messages-sent"
                  ? ({ checked, shiftKey }) => {
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
                    }
                  : undefined
              }
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

function Actions({ filter, checkedMessageIds, messages, setShowBody }) {
  return (
    <Space>
      <Button
        type="text"
        disabled={filter != "messages-inbox"}
        onClick={() => {
          redux.getActions("messages").mark({
            ids: checkedMessageIds,
            saved: true,
          });
          setShowBody(null);
        }}
      >
        <Icon name="download" /> Archive
      </Button>
      {filter != "messages-trash" && (
        <Button
          type="text"
          onClick={() => {
            redux.getActions("messages").mark({
              ids: checkedMessageIds,
              deleted: true,
            });
            setShowBody(null);
          }}
        >
          <Icon name="trash" /> Delete
        </Button>
      )}
      {filter == "messages-trash" && (
        <Button
          danger
          type="text"
          disabled={!hasNotExpire(checkedMessageIds, messages)}
          onClick={() => {
            redux.getActions("messages").mark({
              ids: checkedMessageIds,
              expire: dayjs().add(1, "day").toDate(),
            });
            setShowBody(null);
          }}
        >
          <Icon name="trash" /> Delete Forever
        </Button>
      )}
      {filter != "messages-trash" && (
        <Button
          type="text"
          disabled={!hasUnread(checkedMessageIds, messages)}
          onClick={() => {
            redux.getActions("messages").mark({
              ids: checkedMessageIds,
              read: new Date(),
            });
          }}
        >
          <Icon name="eye" /> Mark Read
        </Button>
      )}
      {filter != "messages-trash" && (
        <Button
          type="text"
          disabled={!hasRead(checkedMessageIds, messages)}
          onClick={() => {
            redux.getActions("messages").mark({
              ids: checkedMessageIds,
              read: null,
            });
          }}
        >
          <Icon name="eye-slash" /> Mark Unread
        </Button>
      )}
      <Button
        type="text"
        disabled={!enableMoveToInbox(filter, checkedMessageIds, messages)}
        onClick={() => {
          redux.getActions("messages").mark({
            ids: checkedMessageIds,
            saved: false,
            deleted: false,
            expire: null,
          });
          setShowBody(null);
        }}
      >
        <Icon name="mail" /> Move to Inbox
      </Button>
    </Space>
  );
}

function enableMoveToInbox(filter, checkedMessageIds, messages) {
  if (filter == "messages-inbox" || filter == "messages-sent") {
    return false;
  }
  if (filter == "messages-all" && !hasSaved(checkedMessageIds, messages)) {
    // every message is already in the inbox
    return false;
  }
  if (filter == "messages-trash") {
    return true;
  }
  return true;
}

function hasUnread(checkedMessageIds, messages) {
  for (const id of checkedMessageIds) {
    const read = messages.getIn([`${id}`, "read"]);
    if (!read || new Date(read).valueOf() == 0) {
      return true;
    }
  }
  return false;
}

function hasRead(checkedMessageIds, messages) {
  for (const id of checkedMessageIds) {
    const read = messages.getIn([`${id}`, "read"]);
    if (read && new Date(read).valueOf() > 0) {
      return true;
    }
  }
  return false;
}

function hasSaved(checkedMessageIds, messages) {
  for (const id of checkedMessageIds) {
    if (messages.getIn([`${id}`, "saved"])) {
      return true;
    }
  }
  return false;
}

function hasNotExpire(checkedMessageIds, messages) {
  for (const id of checkedMessageIds) {
    const expire = messages.getIn([`${id}`, "expire"]);
    if (expire == null || new Date(expire).valueOf() == 0) {
      return true;
    }
  }
  return false;
}
