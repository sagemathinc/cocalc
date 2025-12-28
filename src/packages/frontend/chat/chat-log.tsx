/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

// cSpell:ignore: timespan

import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { VirtuosoHandle } from "react-virtuoso";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { chatBotName, isChatBot } from "@cocalc/frontend/account/chatbot";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { DivTempHeight } from "@cocalc/frontend/jupyter/cell-list";
import { cmp } from "@cocalc/util/misc";
import type { ChatActions } from "./actions";
import Composing from "./composing";
import Message from "./message";
import type {
  ChatMessageTyped,
  ChatMessages,
  Mode,
  NumChildren,
} from "./types";
import type { ThreadIndexEntry } from "./message-cache";
import {
  getRootMessage,
  getThreadRootDate,
  newest_content,
} from "./utils";
import { dateValue, field, replyTo, foldingList } from "./access";
import { COMBINED_FEED_KEY } from "./threads";

// you can use this to quickly disabled virtuoso, but rendering large chatrooms will
// become basically impossible.
const USE_VIRTUOSO = true;

function stripHtml(value: string): string {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "");
}

interface Props {
  project_id: string; // used to render links more effectively
  path: string;
  messages?: ChatMessages;
  threadIndex?: Map<string, ThreadIndexEntry>;
  mode: Mode;
  scrollToBottomRef?: MutableRefObject<(force?: boolean) => void>;
  setLastVisible?: (x: Date | null) => void;
  fontSize?: number;
  actions: ChatActions;
  selectedThread?: string;
  scrollToIndex?: null | number | undefined;
  // scrollToDate = string ms from epoch
  scrollToDate?: null | undefined | string;
  selectedDate?: string;
  scrollCacheId?: string;
  acpState?;
  composerTargetKey?: string | null;
}

export function ChatLog({
  project_id,
  path,
  messages: messagesProp,
  threadIndex,
  scrollToBottomRef,
  mode,
  setLastVisible,
  fontSize,
  actions,
  selectedThread,
  scrollToIndex,
  scrollToDate,
  selectedDate,
  scrollCacheId,
  acpState,
  composerTargetKey,
}: Props) {
  const singleThreadView = selectedThread != null;
  const messages = messagesProp ?? new Map();
  const showThreadHeaders = selectedThread === COMBINED_FEED_KEY;
  const visibleKeys = useMemo<Set<string> | undefined>(() => {
    if (!selectedThread || !threadIndex) return undefined;
    return threadIndex.get(selectedThread)?.messageKeys;
  }, [selectedThread, threadIndex]);
  const combinedKeys = useMemo<string[] | undefined>(() => {
    if (!showThreadHeaders || !threadIndex) return undefined;
    return threadIndex.get(COMBINED_FEED_KEY)?.orderedKeys;
  }, [showThreadHeaders, threadIndex]);
  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const handleSelectThread = useCallback(
    (threadKey: string) => {
      actions.clearAllFilters?.();
      actions.setSelectedThread?.(threadKey);
    },
    [actions],
  );
  const { dates: sortedDates, numChildren } = useMemo<{
    dates: string[];
    numChildren: NumChildren;
  }>(() => {
    if (combinedKeys) {
      setTimeout(() => {
        setLastVisible?.(
          combinedKeys.length === 0
            ? null
            : new Date(parseFloat(combinedKeys[combinedKeys.length - 1])),
        );
      }, 1);
      return { dates: combinedKeys, numChildren: {} };
    }
    const { dates, numChildren } = getSortedDates(
      messages,
      account_id!,
      singleThreadView,
      visibleKeys,
    );
    // TODO: This is an ugly hack because I'm tired and need to finish this.
    // The right solution would be to move this filtering to the store.
    // The timeout is because you can't update a component while rendering another one.
    setTimeout(() => {
      setLastVisible?.(
        dates.length == 0
          ? null
          : new Date(parseFloat(dates[dates.length - 1])),
      );
    }, 1);
    return { dates, numChildren };
  }, [
    messages,
    account_id,
    singleThreadView,
    visibleKeys,
    combinedKeys,
  ]);

  useEffect(() => {
    scrollToBottomRef?.current?.(true);
  }, []);

  useEffect(() => {
    if (scrollToIndex == null) {
      return;
    }
    if (scrollToIndex == -1) {
      scrollToBottomRef?.current?.(true);
    } else {
      virtuosoRef.current?.scrollToIndex({ index: scrollToIndex });
    }
    actions.clearScrollRequest();
  }, [scrollToIndex]);

  useEffect(() => {
    if (scrollToDate == null) {
      return;
    }
    // linear search, which should be fine given that this is not a tight inner loop
    const index = sortedDates.indexOf(scrollToDate);
    if (index == -1) {
      // didn't find it?
      const message = messages.get(scrollToDate);
      if (message == null) {
        // the message really doesn't exist.  Weird.  Give up.
        actions.clearScrollRequest();
        return;
      }
      let tryAgain = false;
      // we clear all filters and ALSO make sure
      // if message is in a folded thread, then that thread is not folded.
      if (account_id && isFolded(messages, message, account_id)) {
        // this actually unfolds it, since it was folded.
        const date = new Date(
          getThreadRootDate({ date: parseFloat(scrollToDate), messages }),
        );
        actions.toggleFoldThread(date);
        tryAgain = true;
      }
      if (tryAgain) {
        // we have to wait a while for full re-render to happen
        setTimeout(() => {
          actions.scrollToDate(parseFloat(scrollToDate));
        }, 10);
      } else {
        // totally give up
        actions.clearScrollRequest();
      }
      return;
    }
    virtuosoRef.current?.scrollToIndex({ index });
    actions.clearScrollRequest();
  }, [scrollToDate]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const manualScrollRef = useRef<boolean>(false);
  const [manualScroll, setManualScroll] = useState(false);

  // Auto-scroll to bottom while an AI message is generating, unless the
  // user has manually scrolled away from the bottom.
  const generating = useMemo(() => {
    if (!messages) return false;
    for (const date of sortedDates) {
      const msg = messages.get(date);
      if (field(msg, "generating") === true) {
        return true;
      }
    }
    return false;
  }, [messages, sortedDates]);

  useEffect(() => {
    if (!generating) return;
    manualScrollRef.current = false;
    setManualScroll(false);
    scrollToBottomRef?.current?.(true);
  }, [generating, scrollToBottomRef]);

  useEffect(() => {
    if (scrollToBottomRef == null) return;
    scrollToBottomRef.current = (force?: boolean) => {
      if (manualScrollRef.current && !force) return;
      manualScrollRef.current = false;
      setManualScroll(false);
      const doScroll = () =>
        virtuosoRef.current?.scrollToIndex({ index: Number.MAX_SAFE_INTEGER });

      doScroll();
      // sometimes scrolling to bottom is requested before last entry added,
      // so we do it again in the next render loop.  This seems needed mainly
      // for side chat when there is little vertical space.
      setTimeout(doScroll, 1);
    };
  }, [scrollToBottomRef != null]);

  return (
    <>
      <MessageList
        {...{
          virtuosoRef,
          sortedDates,
          messages,
          account_id,
          user_map,
          project_id,
          path,
          fontSize,
          actions,
          manualScrollRef,
          manualScroll,
          setManualScroll,
          mode,
          selectedDate,
          numChildren,
          singleThreadView,
          scrollCacheId,
          scrollToBottomRef,
          acpState,
          showThreadHeaders,
          onSelectThread: showThreadHeaders ? handleSelectThread : undefined,
          composerTargetKey,
        }}
      />
      <Composing
        projectId={project_id}
        path={path}
        accountId={account_id}
        userMap={user_map}
      />
    </>
  );
}

function isNextMessageSender(
  index: number,
  dates: string[],
  messages: ChatMessages,
): boolean {
  if (index + 1 === dates.length) {
    return false;
  }
  const currentMessage = messages.get(dates[index]);
  const nextMessage = messages.get(dates[index + 1]);
  return (
    currentMessage != null &&
    nextMessage != null &&
    field(currentMessage, "sender_id") === field(nextMessage, "sender_id")
  );
}

function isPrevMessageSender(
  index: number,
  dates: string[],
  messages: ChatMessages,
): boolean {
  if (index === 0) {
    return false;
  }
  const currentMessage = messages.get(dates[index]);
  const prevMessage = messages.get(dates[index - 1]);
  return (
    currentMessage != null &&
    prevMessage != null &&
    field(currentMessage, "sender_id") === field(prevMessage, "sender_id")
  );
}

function isThread(message: ChatMessageTyped, numChildren: NumChildren) {
  if (replyTo(message) != null) {
    return true;
  }
  const d = dateValue(message)?.valueOf();
  return d != null ? (numChildren[d] ?? 0) > 0 : false;
}

function isFolded(
  messages: ChatMessages,
  message: ChatMessageTyped,
  account_id: string,
) {
  if (account_id == null) {
    return false;
  }
  const rootMsg = getRootMessage({
    message,
    messages,
  }) as any;
  const folding = rootMsg ? foldingList(rootMsg) : undefined;
  return Boolean(folding?.includes?.(account_id));
}

// messages is a Javascript map from
//   - timestamps (ms since epoch as string)
// to
//   - message objects {date: , event:, history, sender_id, reply_to}
//
// It was very easy to sort these before reply_to, which complicates things.
export function getSortedDates(
  messages: ChatMessages,
  account_id: string,
  disableFolding?: boolean,
  visibleKeys?: Set<string>,
): {
  dates: string[];
  numFolded: number;
  numChildren: NumChildren;
} {
  let numFolded = 0;
  let m = messages;
  if (m == null) {
    return {
      dates: [],
      numFolded: 0,
      numChildren: {},
    };
  }

  // Do a linear pass through all messages to divide into threads, so that
  // getSortedDates is O(n) instead of O(n^2) !
  const numChildren: NumChildren = {};
  for (const [key, message] of m) {
    if (visibleKeys && !visibleKeys.has(`${key}`)) continue;
    const parent = replyTo(message);
    if (parent != null) {
      const d = new Date(parent).valueOf();
      numChildren[d] = (numChildren[d] ?? 0) + 1;
    }
  }

  const v: [date: number, reply_to: number | undefined][] = [];
  for (const [date, message] of m) {
    if (visibleKeys && !visibleKeys.has(`${date}`)) continue;
    if (message == null) continue;

    if (!disableFolding) {
      const is_thread = isThread(message, numChildren);
      const is_folded = is_thread && isFolded(messages, message, account_id);
      const is_thread_body = is_thread && replyTo(message) != null;
      const folded = is_thread && is_folded && is_thread_body;
      if (folded) {
        numFolded++;
        continue;
      }
    }

    const reply_to = replyTo(message);
    v.push([
      typeof date === "string" ? parseInt(date) : date,
      reply_to != null ? new Date(reply_to).valueOf() : undefined,
    ]);
  }
  v.sort(cmpMessages);
  const dates = v.map((z) => `${z[0]}`);
  return { dates, numFolded, numChildren };
}

/*
Compare messages as follows:
 - if message has a parent it is a reply, so we use the parent instead for the
   compare
 - except in special cases:
    - one of them is the parent and other is a child of that parent
    - both have same parent
*/
function cmpMessages([a_time, a_parent], [b_time, b_parent]): number {
  // special case:
  // same parent:
  if (a_parent !== undefined && a_parent == b_parent) {
    return cmp(a_time, b_time);
  }
  // one of them is the parent and other is a child of that parent
  if (a_parent == b_time) {
    // b is the parent of a, so b is first.
    return 1;
  }
  if (b_parent == a_time) {
    // a is the parent of b, so a is first.
    return -1;
  }
  // general case.
  return cmp(a_parent ?? a_time, b_parent ?? b_time);
}

export function getUserName(userMap, accountId: string): string {
  if (isChatBot(accountId)) {
    return chatBotName(accountId);
  }
  if (userMap == null) return "Unknown";
  const account = userMap.get(accountId);
  if (account == null) return "Unknown";
  return account.get("first_name", "") + " " + account.get("last_name", "");
}

export function MessageList({
  messages,
  account_id,
  composerTargetKey,
  virtuosoRef,
  sortedDates,
  user_map,
  project_id,
  path,
  fontSize,
  actions,
  manualScrollRef,
  manualScroll = false,
  setManualScroll,
  mode,
  selectedDate,
  numChildren,
  singleThreadView,
  scrollCacheId,
  scrollToBottomRef,
  acpState,
  showThreadHeaders,
  onSelectThread,
}: {
  messages: ChatMessages;
  account_id: string;
  composerTargetKey?: string | null;
  user_map;
  mode;
  sortedDates;
  virtuosoRef?;
  project_id?: string;
  path?: string;
  fontSize?: number;
  actions?;
  manualScrollRef?;
  manualScroll?: boolean;
  setManualScroll?: (value: boolean) => void;
  selectedDate?: string;
  numChildren?: NumChildren;
  singleThreadView?: boolean;
  scrollCacheId?: string;
  scrollToBottomRef?: MutableRefObject<(force?: boolean) => void>;
  acpState?;
  showThreadHeaders?: boolean;
  onSelectThread?: (threadKey: string) => void;
}) {
  const virtuosoHeightsRef = useRef<{ [index: number]: number }>({});
  const [atBottom, setAtBottom] = useState(true);
  const cacheId = scrollCacheId ?? `${project_id}${path}`;
  const initialIndex = Math.max(sortedDates.length - 1, 0); // start at newest
  const endRef = useRef<HTMLDivElement | null>(null);

  const forceScrollToBottom = useCallback(() => {
    if (manualScrollRef) {
      manualScrollRef.current = false;
    }
    setManualScroll?.(false);
    scrollToBottomRef?.current?.(true);
  }, [manualScrollRef, scrollToBottomRef, setManualScroll]);

  const renderThreadHeader = (
    message: ChatMessageTyped,
    currentThreadKey?: string,
    prevThreadKey?: string,
  ) => {
    if (!showThreadHeaders || !currentThreadKey || currentThreadKey === prevThreadKey) {
      return null;
    }
    const root = getRootMessage({ message, messages });
    const rootDate = dateValue(root)?.valueOf();
    const threadKey = rootDate != null ? `${rootDate}` : currentThreadKey;
    const rawTitle =
      (root ? field(root, "name") : undefined)?.trim() ||
      (root ? newest_content(root) : undefined) ||
      "Thread";
    const threadTitle = stripHtml(rawTitle);
    return (
      <div
        style={{
          padding: "6px 8px",
          margin: 8,
          borderRadius: 6,
          background: "#dadada",
          cursor: onSelectThread ? "pointer" : "default",
          fontSize: "90%",
          color: "#333",
        }}
        onClick={
          onSelectThread ? () => onSelectThread(threadKey) : undefined
        }
      >
        {threadTitle}
      </div>
    );
  };

  const renderMessage = (index: number) => {
    const date = sortedDates[index];
    const message: ChatMessageTyped | undefined = messages.get(date);
    if (message == null) {
      console.warn("empty message", { date, index, sortedDates });
      return <div style={{ height: "30px" }} />;
    }
    const currentThreadKey = showThreadHeaders
      ? `${getThreadRootDate({
          date: dateValue(message)?.valueOf() ?? 0,
          messages,
        })}`
      : undefined;
    const prevThreadKey =
      showThreadHeaders && index > 0
        ? `${getThreadRootDate({
            date: dateValue(messages.get(sortedDates[index - 1]))?.valueOf() ?? 0,
            messages,
          })}`
        : undefined;

    const is_thread = numChildren != null && isThread(message, numChildren);
    const is_folded =
      !singleThreadView && is_thread && isFolded(messages, message, account_id);
    const is_thread_body = is_thread && replyTo(message) != null;
    const h = virtuosoHeightsRef.current?.[index];
    const shouldDim =
      showThreadHeaders &&
      composerTargetKey != null &&
      currentThreadKey != null &&
      currentThreadKey !== composerTargetKey;

    const wrapperStyle: CSSProperties = {
      overflow: "hidden",
      paddingTop: index == 0 ? "20px" : undefined,
      opacity: shouldDim ? 0.45 : 1,
    };

    return (
      <div style={wrapperStyle}>
        {renderThreadHeader(message, currentThreadKey, prevThreadKey)}
        <DivTempHeight height={h ? `${h}px` : undefined}>
          <Message
            messages={messages}
            numChildren={numChildren?.[dateValue(message)?.valueOf() ?? NaN]}
            key={date}
            index={index}
            account_id={account_id}
            user_map={user_map}
            message={message}
            selected={date == selectedDate}
            project_id={project_id}
            path={path}
            font_size={fontSize}
            actions={actions}
            is_thread={is_thread}
            is_folded={is_folded}
            is_thread_body={is_thread_body}
            is_prev_sender={isPrevMessageSender(index, sortedDates, messages)}
            show_avatar={!isNextMessageSender(index, sortedDates, messages)}
            mode={mode}
            get_user_name={(account_id: string | undefined) =>
              typeof account_id === "string"
                ? getUserName(user_map, account_id)
                : "Unknown name"
            }
            scroll_into_view={
              virtuosoRef
                ? () => virtuosoRef.current?.scrollIntoView({ index })
                : undefined
            }
            allowReply={
              !singleThreadView &&
              (() => {
                const next = messages.get(sortedDates[index + 1]);
                return next == null ? true : replyTo(next) == null;
              })()
            }
            threadViewMode={singleThreadView}
            onForceScrollToBottom={forceScrollToBottom}
            acpState={acpState?.get(date)}
            dim={shouldDim}
          />
        </DivTempHeight>
      </div>
    );
  };

  useEffect(() => {
    if (!scrollToBottomRef || USE_VIRTUOSO) return;
    scrollToBottomRef.current = () => {
      endRef.current?.scrollIntoView({ block: "end" });
    };
  }, [scrollToBottomRef]);

  if (!USE_VIRTUOSO) {
    return (
      <div>
        {sortedDates.map((_, index) => renderMessage(index))}
        <div ref={endRef} style={{ height: "25vh" }} />
      </div>
    );
  }

  return (
    <StatefulVirtuoso
      ref={virtuosoRef}
      totalCount={sortedDates.length + 1}
      cacheId={cacheId}
      initialTopMostItemIndex={initialIndex}
      itemSize={(el) => {
        const h = el.getBoundingClientRect().height;
        const data = el.getAttribute("data-item-index");
        if (data != null) {
          const index = parseInt(data);
          virtuosoHeightsRef.current[index] = h;
        }
        return h;
      }}
      itemContent={(index) => {
        if (sortedDates.length == index) {
          return <div style={{ height: "25vh" }} />;
        }
        return renderMessage(index);
      }}
      rangeChanged={
        manualScrollRef
          ? ({ endIndex }) => {
              if (endIndex < sortedDates.length - 1) {
                manualScrollRef.current = true;
                setManualScroll?.(true);
              }
            }
          : undefined
      }
      atBottomStateChange={
        manualScrollRef
          ? (atBottom: boolean) => {
              if (!atBottom) {
                manualScrollRef.current = true;
                setManualScroll?.(true);
              }
              setAtBottom(atBottom);
            }
          : undefined
      }
      followOutput={!manualScroll && atBottom ? "smooth" : false}
    />
  );
}
