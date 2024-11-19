import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Checkbox, Flex, Space, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { User } from "@cocalc/frontend/users";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import ReplyButton from "./reply-button";
import { isNullDate, isRead } from "./util";

interface Props {
  checked?: boolean;
  setChecked?: (e: { checked: boolean; shiftKey: boolean }) => void;
  message: MessageType;
  showBody?;
  setShowBody?;
  filter?;
  style?;
}

export default function Message({
  checked,
  setChecked,
  message,
  showBody,
  setShowBody,
  filter,
  style,
}: Props) {
  const toggleBody = () => {
    if (setShowBody == null) {
      return;
    }
    if (showBody) {
      setShowBody(null);
    } else {
      if (filter != "messages-sent" && !isRead(message)) {
        redux.getActions("messages").mark({
          id: message.id,
          read: webapp_client.server_time(),
        });
      }
      setShowBody(message.id);
    }
  };
  const read = isRead(message);

  const user = (
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
        style={{
          fontSize: showBody ? "12pt" : undefined,
          ...(!read ? { fontWeight: "bold" } : undefined),
        }}
        account_id={filter == "messages-sent" ? message.to_id : message.from_id}
        show_avatar
        avatarSize={showBody ? 48 : 20}
      />
    </Tooltip>
  );

  if (showBody) {
    return (
      <div style={{ marginRight: "30px" }}>
        <Flex>
          <div
            style={{
              marginLeft: "58px",
              fontSize: "18pt",
            }}
          >
            {message.subject}
          </div>
          <div style={{ flex: 1 }} />
          {message.from_type == "account" && filter != "messages-sent" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                marginRight: "15px",
              }}
            >
              <ReplyButton type="text" replyTo={message} />
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <TimeAgo
              date={message.created}
              style={{
                whiteSpace: "pre",
                textAlign: "right",
                fontWeight: read ? undefined : "bold",
              }}
            />
          </div>
        </Flex>
        <div>{user}</div>
        <div style={{ marginLeft: "58px", marginTop: "30px" }}>
          <StaticMarkdown value={message.body} />
          <div style={{ height: "30px" }} />
          {message.from_type == "account" && filter != "messages-sent" && (
            <ReplyButton size="large" replyTo={message} />
          )}
          <pre>{JSON.stringify(message, undefined, 2)}</pre>
        </div>
      </div>
    );
  }

  return (
    <Space
      direction="vertical"
      style={{
        width: "100%",
        marginBottom: "-10px",
        marginTop: "-10px",
        ...style,
      }}
    >
      <Flex
        style={{ width: "100%" }}
        onClick={showBody ? undefined : () => toggleBody()}
      >
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
        <div
          style={{
            width: "150px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "pre",
            marginRight: "10px",
          }}
        >
          {user}
        </div>
        <div
          style={{
            flex: 1,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "pre",
            marginRight: "10px",
          }}
        >
          {getTag(message, filter)}
          {read ? message.subject : <b>{message.subject}</b>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <TimeAgo
            date={message.created}
            style={{
              width: "150px",
              textAlign: "right",
              fontWeight: read ? undefined : "bold",
            }}
          />
        </div>
      </Flex>
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
  if (!isNullDate(message.expire)) {
    return (
      <Tooltip
        title={
          <>
            This message is scheduled to be permanently deleted{" "}
            <TimeAgo date={message.expire} />.
          </>
        }
      >
        <Tag color="red">Deleting</Tag>
      </Tooltip>
    );
  }
  return null;
}
