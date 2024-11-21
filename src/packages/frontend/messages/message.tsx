import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Button, Checkbox, Flex, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import ReplyButton from "./reply-button";
import { isNullDate, isFromMe, isRead } from "./util";
import Thread, { ThreadCount } from "./thread";
import type { Threads } from "./types";
import User from "./user";
import { Icon } from "@cocalc/frontend/components/icon";

const LEFT_OFFSET = "53px";

interface Props {
  checked?: boolean;
  setChecked?: (e: { checked: boolean; shiftKey: boolean }) => void;
  message: MessageType;
  showBody?;
  setShowBody?;
  filter?;
  style?;
  threads?: Threads;
  inThread?: boolean;
}

export default function Message(props: Props) {
  if (props.showBody) {
    return <MessageFull {...props} />;
  } else {
    return <MessageInList {...props} />;
  }
}

function MessageInList({
  checked,
  setChecked,
  message,
  setShowBody,
  filter,
  style,
  threads,
}: Props) {
  const read = isRead(message);

  // [ ] todo: need to factor this out and also
  // support types besides 'account'
  let user;
  if (filter == "messages-sent") {
    // message from us to somebody else, so our
    // priority is on *them*.
    user = (
      <Tooltip
        placement="right"
        title={
          isRead(message) ? (
            <>
              Read message <TimeAgo date={message.read} />
            </>
          ) : (
            "Has not yet read message"
          )
        }
      >
        <User
          style={!read ? { fontWeight: "bold" } : undefined}
          type={message.to_type}
          id={message.to_id}
          show_avatar
          avatarSize={20}
        />
      </Tooltip>
    );
  } else {
    // message is to us from somebody else, so we care about them
    user = (
      <>
        <User
          style={!read ? { fontWeight: "bold" } : undefined}
          type={message.from_type}
          id={message.from_id}
          show_avatar
          avatarSize={20}
        />
      </>
    );
  }

  const show = setShowBody
    ? () => {
        if (!isRead(message)) {
          redux.getActions("messages").mark({
            id: message.id,
            read: webapp_client.server_time(),
          });
        }
        setShowBody?.(message.id);
      }
    : undefined;

  return (
    <Flex
      style={{
        width: "100%",
        marginBottom: "-5px",
        marginTop: "-5px",
        cursor: "pointer",
        ...style,
      }}
      onClick={show}
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
      <div style={{ width: "20px", marginRight: "10px" }}>
        {message.thread_id != null && threads != null && (
          <ThreadCount thread_id={message.thread_id} threads={threads} />
        )}
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
      <div
        style={{
          color: "#888",
          marginRight: "10px",
          width: "25px",
          textAlign: "right",
        }}
      >
        {message.id}
      </div>
    </Flex>
  );
}

export function MessageInThread(props: Props) {
  if (props.showBody) {
    return <MessageFull {...props} inThread />;
  } else {
    return <MessageInList {...props} inThread />;
  }
}

function MessageFull({
  message,
  filter,
  threads,
  inThread,
  setShowBody,
}: Props) {
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
          fontSize: "12pt",
          ...(!read ? { fontWeight: "bold" } : undefined),
        }}
        type="account"
        id={filter == "messages-sent" ? message.to_id : message.from_id}
        show_avatar
        avatarSize={44}
      />
    </Tooltip>
  );

  return (
    <div
      style={{
        width: "100%",
        marginRight: "30px",
        marginLeft: inThread ? "-24px" : undefined,
        /* overflowY is so when threads are expanded we can scroll and see them*/
        overflowY: "auto",
      }}
      className={inThread ? undefined : "smc-vfill"}
    >
      {!inThread && message.thread_id != null && threads != null && (
        <Thread
          thread_id={message.thread_id}
          threads={threads}
          filter={filter}
          style={{ marginBottom: "10px" }}
        />
      )}
      <Flex>
        {setShowBody != null && inThread && (
          <Button
            style={{
              /* this whole style is just stupid and lazy.*/
              position: "absolute",
              marginTop: "-14px",
              marginLeft: "-14px",
              fontSize: "15pt",
              color: "#666",
            }}
            type="text"
            onClick={() => {
              // if setShowBody is available, we're in a thread and expanded, so
              // shrink.
              setShowBody?.(null);
            }}
          >
            <Icon name="minus-square" />
          </Button>
        )}
        <div
          style={{
            marginLeft: LEFT_OFFSET,
            fontSize: "16pt",
          }}
        >
          {message.subject}
        </div>
        <div style={{ flex: 1 }} />
        {(message.from_type == "account" || isFromMe(message)) && (
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
      <div style={{ marginTop: "-20px" }}>
        {user}
        <div
          style={{
            marginLeft: LEFT_OFFSET,
            color: "#666",
            marginTop: "-5px",
          }}
        >
          {isFromMe(message) ? "from me" : "to me"}
        </div>
      </div>
      <div
        style={{
          marginLeft: LEFT_OFFSET,
          marginTop: "15px",
        }}
      >
        <StaticMarkdown value={message.body} />
        <div style={{ height: "30px" }} />
        {!inThread &&
          message.from_type == "account" &&
          filter != "messages-sent" && (
            <div>
              <ReplyButton size="large" replyTo={message} />
            </div>
          )}
      </div>
    </div>
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
