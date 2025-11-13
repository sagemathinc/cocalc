import { Checkbox, Flex, Space, Tag, Tooltip } from "antd";
import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import MostlyStaticMarkdown, {
  HighlightText,
} from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { labels } from "@cocalc/frontend/i18n";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { COLORS } from "@cocalc/util/theme";
import Compose from "./compose";
import Like from "./like";
import Read from "./read";
import ReplyButton, { ForwardButton } from "./reply-button";
import Star from "./star";
import Thread, { ThreadCount } from "./thread";
import type { Folder, iThreads } from "./types";
import useCommand from "./use-command";
import User from "./user";
import {
  excludeSelf,
  get,
  isDeleted,
  isDraft,
  isInFolderThreaded,
  isRead,
  isThreadRead,
  isToMe,
  participantsInThread,
  recipientsInThread,
  sendersInThread,
  setFragment,
} from "./util";

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
  threads: iThreads;
  inThread?: boolean;
  focused?: boolean;
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
  focused,
}: Props) {
  const intl = useIntl();
  const fontSize = useTypedRedux("messages", "fontSize");
  const searchWords = useTypedRedux("messages", "searchWords");
  const read = inThread ? isRead(message) : isThreadRead({ message, threads });
  const ids = displayedParticipants({ message, inThread, threads, folder });

  let user = (
    <User
      message={null}
      style={!read ? { fontWeight: "bold" } : undefined}
      id={ids}
      show_avatar
      avatarSize={20}
    />
  );

  const show = setShowThread ? () => setShowThread?.(message.id) : undefined;

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
          <SelectConversation
            setChecked={setChecked}
            checked={checked}
            focused={focused}
          />
        )}
        {!inThread && (
          <Star
            focused={focused}
            message={message}
            threads={threads}
            inThread={inThread}
            style={{ margin: "0 10px 0 5px" }}
          />
        )}
        <div
          style={{
            flex: inThread ? 1 : 0.5,
            marginRight: "10px",
            fontSize,
            display: "flex",
            alignItems: "center",
            ...(!inThread
              ? {
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "pre",
                }
              : undefined),
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
            display: "flex",
            alignItems: "center",
          }}
        >
          {message.thread_id != null && threads != null && !inThread && (
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
              display: "flex",
              alignItems: "center",
              flex: 1,
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "pre",
              marginRight: "10px",
              fontSize,
            }}
          >
            {getTag({ message, threads, folder, intl })}
            <Subject
              message={message}
              threads={threads}
              searchWords={searchWords}
            />
          </div>
        )}
        {inThread && (
          <div>{isDraft(message) && <Tag color="red">Draft</Tag>}</div>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "150px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "pre",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Tooltip
            placement="left"
            title={() => {
              return <Read message={message} />;
            }}
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
        {inThread && (
          <Star
            focused={focused}
            message={message}
            threads={threads}
            inThread={inThread}
            style={{ margin: "0 0 0 5px" }}
          />
        )}
        {inThread && (
          <Like
            focused={focused}
            message={message}
            threads={threads}
            inThread={inThread}
          />
        )}
        {!inThread && (
          <Like
            focused={focused}
            message={message}
            threads={threads}
            inThread={inThread}
          />
        )}
        {SHOW_ID && (
          <Tooltip title={<>{message.id}</>}>
            <div
              style={{
                color: "#999",
                position: "absolute",
                right: 0,
                fontSize: "11px",
              }}
            >
              {message.id}
            </div>
          </Tooltip>
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
  const setShowThread = (id) => {
    props.setShowBody?.(id != null);
  };
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
  focused,
  style,
}: Props) {
  const intl = useIntl();
  const read = isRead(message);
  const readRef = useRef<boolean>(read);
  const searchWords = useTypedRedux("messages", "searchWords");
  const fontSize = useTypedRedux("messages", "fontSize");

  useEffect(() => {
    setFragment({ folder, id: message.id });
  }, [folder, message.id]);

  useEffect(() => {
    // reset this whenever message id changes, because now rendering a
    // different one, and may need to mark it read.
    readRef.current = read;
  }, [message.id]);

  useEffect(() => {
    if (!read && !readRef.current) {
      readRef.current = true;
      // only ever set it to be read once -- e.g., if you click "Unread" then don't want
      // the message to instantly get set to read again just because it is rendered.
      redux.getActions("messages").mark({
        id: message.id,
        read: true,
      });
    }
  }, [read]);

  const user = (
    <User
      style={{
        fontSize: "15pt",
        ...(!read ? { fontWeight: "bold" } : undefined),
      }}
      id={message.from_id}
      show_avatar
      avatarSize={42}
      message={message}
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
        ...style,
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
          <Tooltip
            placement="left"
            title={() => {
              return <Read message={message} />;
            }}
          >
            <div
              style={{
                marginLeft: LEFT_OFFSET,
                color: COLORS.GRAY_M,
              }}
            >
              {isToMe(message) && message.to_ids.length == 1 ? (
                intl.formatMessage({
                  id: "messages.message.to_me",
                  defaultMessage: "to me",
                  description: "Message is sent to myself",
                })
              ) : (
                <>
                  {intl.formatMessage(labels.messages_to).toLowerCase()}{" "}
                  <User id={message.to_ids} message={message} />
                </>
              )}
            </div>
          </Tooltip>
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
            {excludeSelf(participantsInThread({ message, threads })).length >
              1 && (
              <ReplyButton
                type="text"
                replyTo={message}
                replyAll
                label=""
                focused={focused}
              />
            )}
            <ReplyButton type="text" replyTo={message} label="" />
            <ForwardButton
              type="text"
              replyTo={message}
              label=""
              focused={focused}
            />
            {/* TODO: this is not exactly correct, since sometimes a user gets added into a thread. But it's harmless. */}
            {!!get(message, "thread_id") && (
              <ForwardButton type="text" replyTo={message} replyAll label="" />
            )}
          </Space>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Tooltip
            placement="left"
            title={() => {
              return <Read message={message} />;
            }}
          >
            &nbsp;
            <TimeAgo
              date={message.sent}
              style={{
                whiteSpace: "pre",
                textAlign: "right",
                fontWeight: read ? undefined : "bold",
                fontSize,
              }}
            />
          </Tooltip>
        </div>
        <Star
          focused={focused}
          message={message}
          threads={threads}
          inThread={true}
          style={{ marginLeft: "10px" }}
        />
        <div style={{ display: "flex", alignItems: "center" }}>
          <Like
            focused={focused}
            message={message}
            threads={threads}
            inThread={true}
            style={{ marginTop: "-2px" }}
          />
        </div>
        {/* helps line things up when viewing a thread in full/collapsed mode */}
        <div style={{ width: "25px" }} />
        {SHOW_ID && (
          <div
            style={{
              color: "#999",
              fontSize: "12px",
              position: "absolute",
              right: 0,
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
          <Compose
            style={{ marginBottom: "45px" }}
            message={message}
            onCancel={() => setShowThread?.(null)}
          />
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
                  {excludeSelf(participantsInThread({ message, threads }))
                    .length > 1 && (
                    <ReplyButton size="large" replyTo={message} replyAll />
                  )}
                  <ReplyButton size="large" replyTo={message} />
                  <ForwardButton size="large" replyTo={message} />
                  {!!get(message, "thread_id") && (
                    <ForwardButton size="large" replyTo={message} replyAll />
                  )}
                </Space>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getTag({ message, threads, folder, intl }) {
  // set deleted false so still see the tag even when message in the trash,
  // which helps when undeleting.
  const v: React.JSX.Element[] = [];
  if (
    isDraft(message) ||
    isInFolderThreaded({
      message,
      threads,
      folder: "drafts",
    })
  ) {
    v.push(
      <Tag key="draft" color="red">
        <Icon name="note" /> {intl.formatMessage(labels.draft)}
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
        <Icon name="trash" /> {intl.formatMessage(labels.trash)}
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
        <Icon name="container" /> {intl.formatMessage(labels.messages_inbox)}
      </Tag>,
    );
  }

  return <>{v}</>;
}

function SelectConversation({ setChecked, checked, focused }) {
  useCommand({
    ["select-conversation"]: () => {
      if (focused) {
        setChecked({ checked: !checked });
      }
    },
  });

  return (
    <div
      style={
        {
          width: "40px",
          paddingLeft: "10px",
          marginLeft: "-10px",
          display: "flex",
          alignItems: "center",
        } /* This div is because for some reason it is easy to slightly miss
               the checkbox when clicking and open the thread, which is just
               annoying. So we make clicking next to the checkbox a little also work
               to toggle it. */
      }
      onClick={(e) => {
        const shiftKey = e.nativeEvent.shiftKey;
        e.stopPropagation();
        setChecked({ checked: !checked, shiftKey });
      }}
    >
      <Checkbox
        onClick={(e) => e.stopPropagation()}
        style={{ marginRight: "15px" }}
        checked={!!checked}
        onChange={(e) => {
          const shiftKey = e.nativeEvent.shiftKey;
          setChecked({ checked: e.target.checked, shiftKey });
        }}
      />
    </div>
  );
}

/*
Figure out who should be displayed in a top level thread.

When showing lists of distinct threads:

  In sent messages folder this is:
     - all recipients of message (possibly including us)

  In all other folders this is:
     - all people who sent a message to the thread -- i.e., everybody that actually wrote something

When showing messages in a thread:

   Just show the unique sender.

*/

function displayedParticipants({
  message,
  inThread,
  threads,
  folder,
}): string[] {
  if (inThread) {
    // when displaying messages in a thread, always display the sender
    return [message.from_id];
  }
  if (folder != "sent") {
    return sendersInThread({ message, threads });
  }
  return recipientsInThread({ message, threads });
}
