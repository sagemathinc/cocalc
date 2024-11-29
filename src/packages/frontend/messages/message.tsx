import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Checkbox, Flex, Space, Tag, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import ReplyButton from "./reply-button";
import {
  isDraft,
  isDeleted,
  isFromMe,
  isToMe,
  isThreadRead,
  isRead,
  isInFolderThreaded,
  setFragment,
} from "./util";
import Thread, { ThreadCount } from "./thread";
import type { iThreads, Folder } from "./types";
import User from "./user";
import Compose from "./compose";
import { useEffect } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { HighlightText } from "@cocalc/frontend/editors/slate/mostly-static-markdown";

const LEFT_OFFSET = "46px";

declare var DEBUG: boolean;
// useful for debugging!
const SHOW_ID = !!DEBUG;

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
  const fontSize = useTypedRedux("messages", "fontSize");
  const searchWords = useTypedRedux("messages", "searchWords");
  const read = inThread ? isRead(message) : isThreadRead({ message, threads });
  const id = getDisplayedUser({ message, inThread, threads });

  let user = (
    <User
      style={!read ? { fontWeight: "bold" } : undefined}
      id={id}
      show_avatar
      avatarSize={20}
    />
  );

  const show = setShowThread
    ? () => {
        if (!isRead(message)) {
          redux.getActions("messages").mark({
            id: message.id,
            read: true,
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
            flex: 1,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "pre",
            marginRight: "10px",
            fontSize,
          }}
        >
          {folder == "sent" && !inThread && (
            <span style={{ marginRight: "5px" }}>To: </span>
          )}
          {user}
        </div>
        <div
          style={{
            width: "45px",
            textAlign: "right",
            marginRight: "10px",
          }}
        >
          {message.thread_id != null && threads != null && (
            <ThreadCount
              thread_id={message.thread_id}
              threads={threads}
              style={{ fontSize }}
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
              fontSize,
            }}
          >
            {getTag({ message, threads, folder })}
            <Subject
              message={message}
              threads={threads}
              searchWords={searchWords}
            />
          </div>
        )}
        {inThread && (
          <div style={{ flex: 1 }}>
            {isDraft(message) && <Tag color="red">Draft</Tag>}
          </div>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "150px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "pre",
          }}
        >
          <Tooltip
            placement="left"
            title={
              isRead(message) ? (
                <>
                  <User id={message.to_ids} /> read{" "}
                  <TimeAgo date={message.read} />
                </>
              ) : (
                <>
                  <User id={message.to_ids} /> has not read
                </>
              )
            }
          >
            &nbsp;
            <TimeAgo
              date={message.sent}
              style={{
                textAlign: "right",
                fontWeight: read ? undefined : "bold",
                fontSize,
              }}
            />
          </Tooltip>
        </div>
        {SHOW_ID && (
          <div
            style={{
              color: "#888",
              position: "absolute",
              right: 0,
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
            fontSize,
          }}
        >
          <HighlightText searchWords={searchWords} text={message.body} />
        </div>
      )}
    </div>
  );
}

function Subject({ message, threads, searchWords }) {
  const read = isThreadRead({ message, threads });
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
  const read = isRead(message);
  const searchWords = useTypedRedux("messages", "searchWords");
  const fontSize = useTypedRedux("messages", "fontSize");

  useEffect(() => {
    setFragment({ folder, id: message.id });
  }, [folder, message.id]);

  const user = (
    <User
      style={{
        fontSize: "15pt",
        ...(!read ? { fontWeight: "bold" } : undefined),
      }}
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
      {!inThread && !!message.thread_id && threads != null && (
        <Thread
          thread_id={message.thread_id}
          threads={threads}
          folder={folder}
          style={{ marginBottom: "10px", fontSize }}
          defaultExpanded={
            showThread != null ? new Set([showThread]) : undefined
          }
        />
      )}
      <Flex>
        <div style={{ flex: 1 }} onClick={() => setShowThread?.(null)}>
          {user}
          <div
            style={{
              marginLeft: LEFT_OFFSET,
              color: "#666",
            }}
          >
            {isToMe(message) && message.to_ids.length == 1 ? (
              "to me"
            ) : (
              <>
                to <User id={message.to_ids} />
              </>
            )}{" "}
            {isRead(message) ? <>(read)</> : <>(has not read)</>}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginRight: "15px",
          }}
        >
          <Space>
            {rootMessage({ message, threads }).to_ids.length > 1 && (
              <ReplyButton
                type="text"
                replyTo={message}
                replyAll={rootMessage({ message, threads }).to_ids}
                label=""
              />
            )}
            <ReplyButton type="text" replyTo={message} label="" />
          </Space>
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
              fontSize,
            }}
          />
        </div>
        {SHOW_ID && (
          <div
            style={{
              color: "#888",
              marginRight: "10px",
              width: "50px",
              textAlign: "right",
            }}
          >
            {message.id}
          </div>
        )}
      </Flex>

      <div
        style={{
          marginLeft: LEFT_OFFSET,
          marginTop: "30px",
          fontSize,
        }}
      >
        {isDraft(message) && !isDeleted(message) ? (
          <Compose style={{ marginBottom: "45px" }} message={message} />
        ) : (
          <>
            <MostlyStaticMarkdown
              value={message.body}
              searchWords={searchWords}
              style={{ fontSize }}
            />
            <div style={{ height: "30px" }} />
            {!inThread && !isDeleted(message) && (
              <div>
                <Space>
                  {rootMessage({ message, threads }).to_ids.length > 1 && (
                    <ReplyButton
                      size="large"
                      replyTo={message}
                      replyAll={rootMessage({ message, threads }).to_ids}
                    />
                  )}
                  <ReplyButton size="large" replyTo={message} />
                </Space>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getTag({ message, threads, folder }) {
  // set deleted false so still see the tag even when message in the trash,
  // which helps when undeleting.
  const v: JSX.Element[] = [];
  if (
    isInFolderThreaded({
      message: { ...message, to_deleted: false, from_deleted: false },
      threads,
      folder: "drafts",
    })
  ) {
    v.push(
      <Tag key="draft" color="red">
        <Icon name="note" /> Draft
      </Tag>,
    );
  }

  if (
    folder != "trash" &&
    isInFolderThreaded({
      message,
      threads,
      folder: "trash",
    })
  ) {
    // this happens for search.
    v.push(
      <Tag key="inbox" color="blue">
        <Icon name="trash" /> Trash
      </Tag>,
    );
  }

  if (
    folder != "inbox" &&
    folder != "trash" &&
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

// NOTE: returns message if threads aren't fully known/loaded yet.
function rootMessage({ message, threads }): MessageType {
  if (message.thread_id && threads != null) {
    // right now participants in a thread can shrink when you do not "reply all",
    // so we always show the root. people can't be added to an existing thread.
    return threads.get(message.thread_id)?.first().toJS() ?? message;
  }
  return message;
}

function getDisplayedUser({ message, inThread, threads }) {
  // right now participants in a thread can shrink when you do not "reply all",
  // so we always show the root. people can't be added to an existing thread.
  message = rootMessage({ message, threads });
  if (inThread) {
    // in thread display always show who wrote the message
    return message.from_id;
  }
  // top level showing an overall thread -- always show the user that
  // isn't us.  We don't need to look at the other messages in the thread
  // since every message is between us and them.
  if (isFromMe(message)) {
    return message.to_ids;
  } else {
    return message.from_id;
  }
}
