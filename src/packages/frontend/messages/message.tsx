import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Checkbox, Flex, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import ReplyButton from "./reply-button";
import {
  isDraft,
  isInTrash,
  isFromMe,
  isNullDate,
  isToMe,
  isThreadRead,
  isRead,
  isInFolderThreaded,
  setFragment,
} from "./util";
import Thread, { ThreadCount } from "./thread";
import type { iThreads, Folder } from "./types";
import User from "./user";
import { fromJS } from "immutable";
import Compose from "./compose";
import { useEffect } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { HighlightText } from "@cocalc/frontend/editors/slate/mostly-static-markdown";

const LEFT_OFFSET = "46px";

// useful for debugging!
const SHOW_ID = false;

interface Props {
  message: MessageType;
  folder: Folder;
  checked?: boolean;
  setChecked?: (e: { checked: boolean; shiftKey: boolean }) => void;
  // id of message in the thread to show
  showThread?: number;
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
  const searchWords = useTypedRedux("messages", "searchWords");
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
    <div
      style={{
        width: "100%",
        marginBottom: "-5px",
        marginTop: "-5px",
        cursor: "pointer",
        ...style,
      }}
      onClick={show}
    >
      <Flex>
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
        </div>
        <div style={{ width: "45px", textAlign: "right", marginRight: "10px" }}>
          {message.thread_id != null && threads != null && (
            <ThreadCount
              thread_id={message.thread_id}
              threads={threads}
              read={read}
            />
          )}
        </div>
        {!inThread && (
          <div
            style={{
              flex: 1,
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "pre",
              marginRight: "10px",
            }}
          >
            {getTag({ message, threads, folder })}
            <Subject
              message={message}
              threads={threads}
              folder={folder}
              searchWords={searchWords}
            />
          </div>
        )}
        {inThread && (
          <div style={{ flex: 1 }}>
            {isDraft(message) && <Tag color="orange">Draft</Tag>}
          </div>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <Tooltip
            placement="left"
            title={
              isRead({ message, folder }) && !isNullDate(message.read) ? (
                <>
                  <User id={message.to_id} type={message.to_type} /> read{" "}
                  <TimeAgo date={message.read} />
                </>
              ) : (
                <>
                  <User id={message.to_id} type={message.to_type} /> has not
                  read
                </>
              )
            }
          >
            &nbsp;
            <TimeAgo
              date={message.sent}
              style={{
                width: "150px",
                textAlign: "right",
                fontWeight: read ? undefined : "bold",
              }}
            />
          </Tooltip>
        </div>
        {SHOW_ID && (
          <div
            style={{
              color: "#888",
              marginRight: "10px",
              width: "35px",
              textAlign: "right",
            }}
          >
            {message.id}
          </div>
        )}
      </Flex>
      {inThread && (
        <div
          style={{
            overflow: "hidden",
            height: "1.5em",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#666",
          }}
        >
          <HighlightText searchWords={searchWords} text={message.body} />
        </div>
      )}
    </div>
  );
}

function Subject({ message, folder, threads, searchWords }) {
  const read = isThreadRead({ message, threads, folder });
  let body;
  if (searchWords.size > 0) {
    body = <HighlightText text={message.subject} searchWords={searchWords} />;
  } else {
    body = message.subject;
  }

  return read ? body : <b>{body}</b>;
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
  showThread,
}: Props) {
  const read = isRead({ message, folder });
  const searchWords = useTypedRedux("messages", "searchWords");

  useEffect(() => {
    setFragment({ folder, id: message.id });
  }, [folder, message.id]);

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
        paddingRight: "15px",
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
          defaultExpanded={
            showThread != null ? new Set([showThread]) : undefined
          }
        />
      )}
      <Flex>
        <div style={{ flex: 1 }} onClick={() => setShowThread?.(null)} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginRight: "15px",
          }}
        >
          <ReplyButton type="text" replyTo={message} label="" />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <TimeAgo
            date={message.sent}
            style={{
              whiteSpace: "pre",
              textAlign: "right",
              fontWeight: read ? undefined : "bold",
            }}
          />
        </div>
      </Flex>
      <div style={{ marginTop: "-20px" }} onClick={() => setShowThread?.(null)}>
        {user}
        <div
          style={{
            marginLeft: LEFT_OFFSET,
            color: "#666",
            marginTop: "-46px",
          }}
        >
          {isToMe(message) ? (
            "to me"
          ) : (
            <>
              to <User id={message.to_id} type={message.to_type} />
            </>
          )}{" "}
          {isRead({ message, folder }) && !isNullDate(message.read) ? (
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
          marginTop: "30px",
        }}
      >
        {isFromMe(message) && message.sent == null && !isInTrash(message) ? (
          <Compose style={{ marginBottom: "45px" }} message={message} />
        ) : (
          <>
            <MostlyStaticMarkdown
              value={message.body}
              searchWords={searchWords}
              style={{ fontSize: "11pt" }}
            />
            <div style={{ height: "30px" }} />
            {!inThread && !isInTrash(message) && (
              <div>
                <ReplyButton size="large" replyTo={message} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getTag({ message: message0, threads, folder }) {
  // set deleted false so still see the tag even when message in the trash,
  // which helps when undeleting.
  const message = fromJS(message0).set("deleted", false);
  const v: JSX.Element[] = [];
  if (
    isInFolderThreaded({
      message,
      threads,
      folder: "drafts",
    })
  ) {
    v.push(
      <Tag key="draft" color="orange">
        <Icon name="note" /> Draft
      </Tag>,
    );
  }

  if (
    folder != "inbox" &&
    isInFolderThreaded({
      message,
      threads,
      folder: "inbox",
    })
  ) {
    v.push(
      <Tag key="inbox" color="green">
        <Icon name="container" /> Inbox
      </Tag>,
    );
  }

  const expire = message.get("expire");
  if (!isNullDate(expire)) {
    v.push(
      <Tooltip
        key="deleting"
        title={
          <>
            This message is scheduled to be permanently deleted{" "}
            <TimeAgo date={expire} />.
          </>
        }
      >
        <Tag color="red">
          <Icon name="trash" /> Deleting...
        </Tag>
      </Tooltip>,
    );
  }
  return <>{v}</>;
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
