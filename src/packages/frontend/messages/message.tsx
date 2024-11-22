import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Button, Checkbox, Flex, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import ReplyButton from "./reply-button";
import {
  isNullDate,
  isFromMe,
  isToMe,
  isThreadRead,
  isRead,
  isInFolderThreaded,
} from "./util";
import Thread, { ThreadCount } from "./thread";
import type { iThreads, Folder } from "./types";
import User from "./user";
import { Icon } from "@cocalc/frontend/components/icon";
import { fromJS } from "immutable";

const LEFT_OFFSET = "46px";

interface Props {
  message: MessageType;
  folder: Folder;
  checked?: boolean;
  setChecked?: (e: { checked: boolean; shiftKey: boolean }) => void;
  showThread?;
  setShowThread?;
  style?;
  threads?: iThreads;
  inThread?: boolean;
}

export default function Message(props: Props) {
  if (props.showThread) {
    return <MessageFull {...props} />;
  } else {
    return <MessageInList {...props} />;
  }
}

function MessageInList({
  checked,
  setChecked,
  message,
  setShowThread,
  folder,
  style,
  threads,
  inThread,
}: Props) {
  const read = inThread
    ? isRead({ message, folder })
    : isThreadRead({ message, threads, folder });

  const { id, type } = getDisplayedUser({ message, inThread });

  let user = (
    <User
      style={!read ? { fontWeight: "bold" } : undefined}
      type={type}
      id={id}
      show_avatar
      avatarSize={20}
    />
  );

  const show = setShowThread
    ? () => {
        if (!isRead({ message, folder })) {
          redux.getActions("messages").mark({
            id: message.id,
            read: webapp_client.server_time(),
          });
        }
        setShowThread?.(message.id);
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
          width: "200px",
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "pre",
          marginRight: "10px",
        }}
      >
        {folder == "sent" && !inThread && (
          <span style={{ marginRight: "5px" }}>To: </span>
        )}
        {user}
        {message.thread_id != null && threads != null && (
          <span>
            <ThreadCount thread_id={message.thread_id} threads={threads} />
          </span>
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
        {!inThread && folder != "inbox" && getTag({ message, threads })}
        {read ? message.subject : <b>{message.subject}</b>}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Tooltip
          placement="left"
          title={
            isRead({ message, folder }) ? (
              <>
                <User id={message.to_id} type={message.to_type} /> read{" "}
                <TimeAgo date={message.read} />
              </>
            ) : (
              <>
                <User id={message.to_id} type={message.to_type} /> has not read
              </>
            )
          }
        >
          &nbsp;
          <TimeAgo
            date={message.created}
            style={{
              width: "150px",
              textAlign: "right",
              fontWeight: read ? undefined : "bold",
            }}
          />
        </Tooltip>
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

interface InThreadProps extends Props {
  showBody: boolean;
  setShowBody: (show: boolean) => void;
}

export function MessageInThread(props: InThreadProps) {
  const setShowThread = (id) => props.setShowBody?.(id != null);
  if (props.showBody) {
    return <MessageFull {...props} setShowThread={setShowThread} inThread />;
  } else {
    return <MessageInList {...props} setShowThread={setShowThread} inThread />;
  }
}

function MessageFull({
  message,
  folder,
  threads,
  inThread,
  setShowThread,
}: Props) {
  const read = isRead({ message, folder });

  const user = (
    <User
      style={{
        fontSize: "12pt",
        ...(!read ? { fontWeight: "bold" } : undefined),
      }}
      type={message.from_type}
      id={message.from_id}
      show_avatar
      avatarSize={42}
    />
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
          folder={folder}
          style={{ marginBottom: "10px" }}
        />
      )}
      <Flex>
        <div
          style={{
            marginLeft: LEFT_OFFSET,
            fontSize: "16pt",
          }}
        >
          {message.subject}
        </div>
        <div style={{ flex: 1 }} />
        {setShowThread != null && inThread && (
          <Button
            style={{ fontSize: "15pt", color: "#666" }}
            type="text"
            onClick={() => {
              // if setShowThread is available, we're in a thread and expanded, so
              // shrink.
              setShowThread?.(null);
            }}
          >
            <Icon name="ColumnHeightOutlined" />
          </Button>
        )}
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
          {isToMe(message) ? (
            "to me"
          ) : (
            <>
              to <User id={message.to_id} type={message.to_type} />
            </>
          )}{" "}
          {isRead({ message, folder }) ? (
            <>
              (read <TimeAgo date={message.read} />)
            </>
          ) : (
            <>(has not read)</>
          )}
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
        {!inThread && (
          <div>
            <ReplyButton size="large" replyTo={message} />
          </div>
        )}
      </div>
    </div>
  );
}

function getTag({ message, threads }) {
  if (
    isInFolderThreaded({
      message: fromJS(message),
      threads,
      folder: "inbox",
    })
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

/* 
Figure out who should be displayed in a top level thread.
In all cases, this is the entity that isn't us in the thread,
unless we are writing to ourself.  

A key thing is that in cocalc messaging, messages go between
at most two entities.  This is NOT group chat in a single thread! 
To have messages between three people, copies of the message are
made, or you are chatting with support (say), which is just 
one entity.
*/

function getDisplayedUser({ message, inThread }) {
  if (inThread) {
    // in thread display always show who wrote the message
    return { type: message.from_type, id: message.from_id };
  }
  // top level showing an overall thread -- always show the user that
  // isn't us.  We don't need to look at the other messages in the thread
  // since every message is between us and them.
  if (isFromMe(message)) {
    return { type: message.to_type, id: message.to_id };
  } else {
    return { type: message.from_type, id: message.from_id };
  }
}
