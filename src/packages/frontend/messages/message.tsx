import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Checkbox, Flex, Space, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { User } from "@cocalc/frontend/users";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import ReplyButton from "./reply-button";
import { isRead } from "./util";

interface Props {
  checked?: boolean;
  setChecked?: (e: { checked: boolean; shiftKey: boolean }) => void;
  message: MessageType;
  showBody?;
  setShowBody?;
  filter?;
}

export default function Message({
  checked,
  setChecked,
  message,
  showBody,
  setShowBody,
  filter,
}: Props) {
  const toggleBody = () => {
    if (showBody == null) {
      return;
    }
    if (showBody.has(message.id)) {
      showBody.delete(message.id);
    } else {
      showBody.add(message.id);
      if (filter != "messages-sent" && !message.read) {
        redux.getActions("messages").mark({
          id: message.id,
          read: webapp_client.server_time(),
        });
      }
    }
    // should use immutable js but I'm lazy and not big.
    setShowBody(new Set(showBody));
  };

  return (
    <Space
      direction="vertical"
      style={{ width: "100%", marginBottom: "-10px" }}
    >
      <Flex style={{ width: "100%" }} onClick={() => toggleBody()}>
        {setChecked != null && (
          <Checkbox
            onClick={(e) => e.stopPropagation()}
            style={{ marginRight: "15px" }}
            checked={!!checked}
            onChange={(e) => {
              const shiftKey = e.nativeEvent.shiftKey;
              setChecked({ checked: e.target.checked, shiftKey });
            }}
          />
        )}
        <div style={{ width: "200px" }}>
          <Tooltip
            placement="right"
            title={
              filter != "messages-sent" ? undefined : isRead(message) ? (
                <>
                  Read message <TimeAgo date={message.read} />
                </>
              ) : (
                "Has not yet read message"
              )
            }
          >
            &nbsp;{/*the nbsp makes the tooltip work -- weird */}
            <User
              account_id={
                filter == "messages-sent" ? message.to_id : message.from_id
              }
              show_avatar
              avatarSize={20}
            />
          </Tooltip>
        </div>
        <div style={{ flex: 0.2 }} />
        <div style={{ flex: 0.8, cursor: "pointer" }}>
          {getTag(message, filter)}
          {isRead(message) ? message.subject : <b>{message.subject}</b>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <TimeAgo
            date={message.created}
            style={{ width: "150px", textAlign: "right" }}
          />
        </div>
      </Flex>
      <div>
        {(showBody?.has(message.id) || showBody == null) && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "10px 15px 0 15px",
              marginBottom: "15px",
            }}
          >
            <StaticMarkdown value={message.body} />
            {message.from_type == "account" &&
              filter != "messages-sent" &&
              showBody != null && <ReplyButton type="text" replyTo={message} />}
          </div>
        )}
      </div>
    </Space>
  );
}

function getTag(message, filter) {
  if (
    filter != "messages-sent" &&
    filter != "messages-inbox" &&
    !message.saved &&
    !message.deleted
  ) {
    return <Tag color="green">Inbox</Tag>;
  }
  if (message.expire) {
    return (
      <Tooltip
        title={
          <>
            This message is scheduled to be permanently deleted{" "}
            <TimeAgo date={message.expire} />.
          </>
        }
      >
        <Tag color="red">Permanently Delete</Tag>
      </Tooltip>
    );
  }
  return null;
}
