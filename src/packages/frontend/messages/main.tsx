import { useEffect, useMemo, useState } from "react";
import { Button, Flex, List, Popconfirm, Space, Spin } from "antd";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { get_array_range, plural } from "@cocalc/util/misc";
import Message from "./message";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import {
  expandToThreads,
  getFilteredMessages,
  isExpired,
  isThreadRead,
  isInFolderThreaded,
  setFragment,
  getThreadId,
} from "./util";
import { isFolder, Folder } from "./types";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { HighlightText } from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import Zoom from "./zoom";

export default function Main({ messages, threads, filter, search }) {
  const [checkedMessageIds, setCheckedMessageIds] = useState<Set<number>>(
    new Set(),
  );
  const [mostRecentChecked, setMostRecentChecked] = useState<number | null>(
    null,
  );

  const folder: Folder = useMemo(() => {
    const folder = filter.split("-")[1];
    if (!isFolder(folder)) {
      // BUG -- should never happen!
      return "inbox" as Folder;
    }
    if (folder != "search") {
      // clear search when switching to any other folder -- in next update loop
      setTimeout(() => {
        redux.getActions("messages").search("");
      }, 0);
    }
    return folder;
  }, [filter]);

  const [showThread, setShowThread0] = useState<number | null>(null);
  const setShowThread = (id: number | null) => {
    setShowThread0(id);
    setFragment({ folder, id: id ?? undefined });
    redux.getActions("mentions").setState({ id: id ?? undefined });
  };

  const filteredMessages: MessageType[] = useMemo(() => {
    if (messages == null || threads == null) {
      return [];
    }
    return getFilteredMessages({ messages, threads, folder, search });
  }, [messages, threads, folder, search]);

  useEffect(() => {
    if (checkedMessageIds.size > 0) {
      // update information about which messages are selected.
      let changed = false;
      const messageIds = new Set(filteredMessages.map(({ id }) => id));
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
  }, [filteredMessages]);

  const fragmentId = useTypedRedux("mentions", "id");

  useEffect(() => {
    setCheckedMessageIds(new Set());
    if (fragmentId == null) {
      setShowThread(null);
    }
  }, [folder]);

  useEffect(() => {
    if (fragmentId != showThread) {
      setShowThread(fragmentId ?? null);
    }
  }, [fragmentId]);

  if (showThread != null) {
    return (
      <ShowOneThread
        {...{
          showThread,
          setShowThread,
          threads,
          folder,
          messages,
          filteredMessages,
        }}
      />
    );
  } else {
    return (
      <ShowAllThreads
        {...{
          showThread,
          setShowThread,
          threads,
          folder,
          messages,
          mostRecentChecked,
          setMostRecentChecked,
          checkedMessageIds,
          setCheckedMessageIds,
          filteredMessages,
        }}
      />
    );
  }
}

// These are actions for an entire THREAD in all cases.
function Actions({
  folder,
  checkedMessageIds,
  messages,
  setShowThread,
  threads,
}) {
  return (
    <Space wrap>
      {folder != "sent" && folder != "trash" && folder != "search" && (
        <Button
          type="text"
          disabled={folder != "inbox"}
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              saved: true,
            });
            setShowThread(null);
          }}
        >
          <Icon name="download" /> Archive
        </Button>
      )}
      {folder != "trash" && (
        <Button
          type="text"
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              deleted: true,
            });
            setShowThread(null);
          }}
        >
          <Icon name="trash" /> Delete
        </Button>
      )}
      {folder == "trash" && (
        <Popconfirm
          title={() => {
            const n = expandToThreads({
              ids: checkedMessageIds,
              threads,
              messages,
            }).size;
            return `Are you sure you want to delete ${n == 1 ? "this" : "these"} ${n} ${plural(n, "message")} permanently?`;
          }}
          onConfirm={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              expire: true,
            });
            setShowThread(null);
          }}
          okText="Yes"
          cancelText="No"
        >
          <Button
            danger
            type="text"
            disabled={!hasNotExpire({ checkedMessageIds, messages })}
          >
            <Icon name="trash" /> Delete Forever
          </Button>
        </Popconfirm>
      )}
      {folder != "trash" && (
        <Button
          type="text"
          disabled={
            !hasUnread({ checkedMessageIds, messages, threads, folder })
          }
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              read: true,
            });
          }}
        >
          <Icon name="eye" /> Read
        </Button>
      )}
      {folder != "trash" && (
        <Button
          type="text"
          disabled={!hasRead({ checkedMessageIds, messages, threads, folder })}
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              read: false,
            });
          }}
        >
          <Icon name="eye-slash" /> Unread
        </Button>
      )}
      {folder != "trash" && folder != "search" && folder != "sent" && (
        <Button
          type="text"
          disabled={
            !enableMoveToInbox({
              folder,
              checkedMessageIds,
              messages,
              threads,
            })
          }
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              saved: false,
              deleted: false,
            });
            setShowThread(null);
          }}
        >
          <Icon name="container" /> To Inbox
        </Button>
      )}
      {(folder == "trash" || folder == "search") && (
        <Button
          type="text"
          onClick={() => {
            redux.getActions("messages").mark({
              ids: expandToThreads({
                ids: checkedMessageIds,
                threads,
                messages,
              }),
              deleted: false,
            });
            setShowThread(null);
          }}
        >
          <Icon name="undo" /> Undelete
        </Button>
      )}
    </Space>
  );
}

function ShowAllThreads({
  showThread,
  setShowThread,
  threads,
  folder,
  messages,
  mostRecentChecked,
  setMostRecentChecked,
  checkedMessageIds,
  setCheckedMessageIds,
  filteredMessages,
}: {
  showThread;
  setShowThread;
  threads;
  folder;
  messages;
  mostRecentChecked;
  setMostRecentChecked;
  checkedMessageIds;
  setCheckedMessageIds;
  filteredMessages: MessageType[];
}) {
  return (
    <>
      <Flex style={{ minHeight: "37px" }}>
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
          <Actions
            folder={folder}
            checkedMessageIds={checkedMessageIds}
            messages={messages}
            setShowThread={setShowThread}
            threads={threads}
          />
        )}
        <div style={{ flex: 1 }} />
        <Zoom />
      </Flex>
      <List
        style={{ overflowY: "auto" }}
        bordered
        dataSource={filteredMessages}
        renderItem={(message) => (
          <List.Item style={{ background: "#f2f6fc" }}>
            <Message
              threads={threads}
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
              showThread={showThread}
              setShowThread={setShowThread}
              folder={folder}
            />
          </List.Item>
        )}
      />
    </>
  );
}

function ShowOneThread({
  // showThread = id of a HEAD message in a thread.
  showThread,
  setShowThread,
  threads,
  folder,
  messages,
  filteredMessages,
}) {
  const searchWords = useTypedRedux("messages", "searchWords");

  const mesgIndex = useMemo(() => {
    const v = filteredMessages.map(({ id }) => id);
    const i = v.indexOf(showThread);
    if (i != -1) {
      return i;
    }
    // It might just be that there is a newer message in this thread.
    // Alternatively, the thread we are currently viewing no longer exists in the given folder,
    // so change state to viewing threads instead... soon.
    // (Always stay in a search view though!)
    const message = messages.get(showThread);
    const inFolder =
      folder == "search" ||
      isInFolderThreaded({
        threads,
        message,
        folder,
      });
    if (message != null && inFolder) {
      // Maybe thread exists, but has a newer HEAD, so change to that.
      const thread_id = getThreadId(message);
      const m = threads.get(thread_id)?.last();
      if (m != null) {
        // fix?
        const newHeadIndex = m.get("id");
        const j = v.indexOf(newHeadIndex);
        if (j != -1) {
          setTimeout(() => {
            setShowThread(newHeadIndex);
          }, 0);
          return j;
        }
      }
    }

    //     setTimeout(() => {
    //       // Thread no longer exists, e.g., archiving a thread in the inbox,
    //       // so just close the thread view.
    //       setShowThread(null);
    //     }, 0);

    return -1;
  }, [showThread, filteredMessages, threads, messages]);

  const message = useMemo(
    () => messages.get(showThread)?.toJS(),
    [messages, showThread],
  );

  const first = useMemo(() => {
    if (!message?.thread_id) {
      return message;
    }
    const thread = threads.get(message?.thread_id);
    return thread?.get(0)?.toJS() ?? message;
  }, [message, threads]);

  if (message == null) {
    return <Spin />;
  }

  return (
    <>
      <Flex style={{ marginBottom: "5px" }}>
        <Button
          size="large"
          type="text"
          onClick={() => {
            setShowThread(null);
          }}
        >
          <Icon
            name="left-circle-o"
            style={{ fontSize: "14pt", color: "#666" }}
          />
          Back
        </Button>
        <Actions
          threads={threads}
          folder={folder}
          checkedMessageIds={new Set([showThread])}
          messages={messages}
          setShowThread={setShowThread}
        />
        <div style={{ flex: 1 }} />
        {mesgIndex != -1 && (
          <Space>
            <Zoom style={{ marginRight: "15px" }} />
            {mesgIndex + 1} of {filteredMessages.length}
            <Button
              size="large"
              disabled={mesgIndex <= 0}
              type="text"
              onClick={() => {
                setShowThread(filteredMessages[mesgIndex - 1]?.id);
              }}
            >
              <Icon name="chevron-left" />
            </Button>
            <Button
              size="large"
              disabled={mesgIndex >= filteredMessages.length - 1}
              type="text"
              onClick={() => {
                setShowThread(filteredMessages[mesgIndex + 1]?.id);
              }}
            >
              <Icon name="chevron-right" />
            </Button>
          </Space>
        )}
      </Flex>
      <div style={{ fontSize: "22px", marginBottom: "15px" }}>
        <HighlightText searchWords={searchWords} text={first.subject} />
      </div>
      <Message
        message={message}
        threads={threads}
        showThread={showThread}
        setShowThread={setShowThread}
        folder={folder}
        style={{ paddingLeft: "12px" }}
      />
    </>
  );
}

function enableMoveToInbox({ folder, checkedMessageIds, messages, threads }) {
  if (
    folder == "inbox" ||
    folder == "sent" ||
    folder == "drafts" ||
    folder == "search"
  ) {
    return false;
  }
  if (
    folder == "all" &&
    everyMessageIsInInbox({ checkedMessageIds, messages, threads })
  ) {
    // every message is already in the inbox
    return false;
  }
  if (folder == "trash") {
    return true;
  }
  return true;
}

function hasUnread({ checkedMessageIds, messages, threads, folder }) {
  if (folder == "drafts") {
    return false;
  }
  for (const id of checkedMessageIds) {
    if (!isThreadRead({ threads, message: messages.get(id) })) {
      return true;
    }
  }
  return false;
}

function hasRead({ checkedMessageIds, messages, threads, folder }) {
  if (folder == "drafts") {
    return false;
  }
  for (const id of checkedMessageIds) {
    if (isThreadRead({ threads, message: messages.get(id) })) {
      return true;
    }
  }
  return false;
}

function everyMessageIsInInbox({ checkedMessageIds, messages, threads }) {
  for (const id of checkedMessageIds) {
    if (
      !isInFolderThreaded({
        threads,
        message: messages.get(id),
        folder: "inbox",
      })
    ) {
      return false;
    }
  }
  return true;
}

function hasNotExpire({ checkedMessageIds, messages }) {
  for (const id of checkedMessageIds) {
    if (!isExpired(messages.get(id))) {
      return true;
    }
  }
  return false;
}
