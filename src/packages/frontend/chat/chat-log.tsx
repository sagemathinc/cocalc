/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

// cSpell:ignore: timespan

import { Alert, Button, Divider } from "antd";
import { Set as immutableSet } from "immutable";
import { throttle } from "lodash";
import {
  type CSSProperties,
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { chatBotName, isChatBot } from "@cocalc/frontend/account/chatbot";
import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { HashtagBar } from "@cocalc/frontend/editors/task-editor/hashtag-bar";
import { DivTempHeight } from "@cocalc/frontend/jupyter/cell-list";
import {
  cmp,
  hoursToTimeIntervalHuman,
  parse_hashtags,
  plural,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";
import Composing from "./composing";
import { filterMessages } from "./filter-messages";
import Message from "./message";
import type {
  ChatMessageTyped,
  ChatMessages,
  CostEstimate,
  Mode,
  NumChildren,
} from "./types";
import {
  getRootMessage,
  getSelectedHashtagsSearch,
  getThreadRootDate,
  isThreadResolved,
  newest_content,
} from "./utils";

interface Props {
  project_id: string; // used to render links more effectively
  path: string;
  mode: Mode;
  scrollToBottomRef?: MutableRefObject<(force?: boolean) => void>;
  setLastVisible?: (x: Date | null) => void;
  fontSize?: number;
  actions: ChatActions;
  search;
  filterRecentH?;
  selectedHashtags;
  disableFilters?: boolean;
  selectedThread?: string;
  scrollToIndex?: null | number | undefined;
  // scrollToDate = string ms from epoch
  scrollToDate?: null | undefined | string;
  selectedDate?: string;
  costEstimate?;
  // ms-epoch of the last message the current user has read in this thread
  lastReadDate?: number;
}

export function ChatLog({
  project_id,
  path,
  scrollToBottomRef,
  mode,
  setLastVisible,
  fontSize,
  actions,
  search: search0,
  filterRecentH,
  selectedHashtags: selectedHashtags0,
  disableFilters,
  selectedThread,
  scrollToIndex,
  scrollToDate,
  selectedDate,
  costEstimate,
  lastReadDate,
}: Props) {
  const storeMessages = useRedux(
    ["messages"],
    project_id,
    path,
  ) as ChatMessages;
  const singleThreadView = selectedThread != null;
  const messages = useMemo(() => {
    if (!selectedThread || storeMessages == null) {
      return storeMessages;
    }
    return storeMessages.filter((message) => {
      if (message == null) return false;
      const replyTo = message.get("reply_to");
      if (replyTo != null) {
        return `${new Date(replyTo).valueOf()}` === selectedThread;
      }
      const dateValue = message.get("date")?.valueOf();
      return dateValue != null ? `${dateValue}` === selectedThread : false;
    }) as ChatMessages;
  }, [storeMessages, selectedThread]);
  // see similar code in task list:
  const { selectedHashtags, selectedHashtagsSearch } = useMemo(() => {
    return getSelectedHashtagsSearch(selectedHashtags0);
  }, [selectedHashtags0]);
  const search = (search0 + " " + selectedHashtagsSearch).trim();

  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const {
    dates: sortedDates,
    numFolded,
    numChildren,
  } = useMemo<{
    dates: string[];
    numFolded: number;
    numChildren: NumChildren;
  }>(() => {
    const { dates, numFolded, numChildren } = getSortedDates(
      messages,
      search,
      account_id!,
      filterRecentH,
      singleThreadView,
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
    return { dates, numFolded, numChildren };
  }, [messages, search, project_id, path, filterRecentH, singleThreadView]);

  useEffect(() => {
    scrollToBottomRef?.current?.(true);
  }, [search]);

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
      if (messages.size > sortedDates.length && (search || filterRecentH)) {
        // there was a search, so clear it just to be sure -- it could still hide
        // the folded threaded
        actions.clearAllFilters();
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

  const visibleHashtags = useMemo(() => {
    let X = immutableSet<string>([]);
    if (disableFilters) {
      return X;
    }
    for (const date of sortedDates) {
      const message = messages.get(date);
      const value = newest_content(message);
      for (const x of parse_hashtags(value)) {
        const tag = value.slice(x[0] + 1, x[1]).toLowerCase();
        X = X.add(tag);
      }
    }
    return X;
  }, [messages, sortedDates]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const manualScrollRef = useRef<boolean>(false);

  useEffect(() => {
    if (scrollToBottomRef == null) return;
    scrollToBottomRef.current = (force?: boolean) => {
      if (manualScrollRef.current && !force) return;
      manualScrollRef.current = false;
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
      {visibleHashtags.size > 0 && (
        <HashtagBar
          style={{ margin: "5px 15px 15px 15px" }}
          actions={{
            set_hashtag_state: (tag, state) => {
              actions.setHashtagState(tag, state);
            },
          }}
          selected_hashtags={selectedHashtags0}
          hashtags={visibleHashtags}
        />
      )}
      {messages != null && (
        <NotShowing
          num={messages.size - numFolded - sortedDates.length}
          showing={sortedDates.length}
          search={search}
          filterRecentH={filterRecentH}
          actions={actions}
        />
      )}
      <MessageList
        {...{
          virtuosoRef,
          sortedDates,
          messages,
          search,
          account_id,
          user_map,
          project_id,
          path,
          fontSize,
          selectedHashtags,
          actions,
          costEstimate,
          manualScrollRef,
          mode,
          selectedDate,
          numChildren,
          singleThreadView,
          lastReadDate,
          selectedThread,
        }}
      />
      <Composing
        projectId={project_id}
        path={path}
        accountId={account_id}
        userMap={user_map}
        selectedThread={selectedThread}
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
    currentMessage.get("sender_id") === nextMessage.get("sender_id")
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
    currentMessage.get("sender_id") === prevMessage.get("sender_id")
  );
}

function isThread(message: ChatMessageTyped, numChildren: NumChildren) {
  if (message.get("reply_to") != null) {
    return true;
  }
  return (numChildren[message.get("date").valueOf()] ?? 0) > 0;
}

function isFolded(
  messages: ChatMessages,
  message: ChatMessageTyped,
  account_id: string,
) {
  if (account_id == null) {
    return false;
  }
  const rootMsg = getRootMessage({ message: message.toJS(), messages });
  return rootMsg?.get("folding")?.includes(account_id) ?? false;
}

// messages is an immutablejs map from
//   - timestamps (ms since epoch as string)
// to
//   - message objects {date: , event:, history, sender_id, reply_to}
//
// It was very easy to sort these before reply_to, which complicates things.
export function getSortedDates(
  messages: ChatMessages,
  search: string | undefined,
  account_id: string,
  filterRecentH?: number,
  disableFolding?: boolean,
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

  // we assume filterMessages contains complete threads.  It does
  // right now, but that's an assumption in this function.
  m = filterMessages({ messages: m, filter: search, filterRecentH });

  // Do a linear pass through all messages to divide into threads, so that
  // getSortedDates is O(n) instead of O(n^2) !
  const numChildren: NumChildren = {};
  for (const [_, message] of m) {
    const parent = message.get("reply_to");
    if (parent != null) {
      const d = new Date(parent).valueOf();
      numChildren[d] = (numChildren[d] ?? 0) + 1;
    }
  }

  const v: [date: number, reply_to: number | undefined][] = [];
  for (const [date, message] of m) {
    if (message == null) continue;

    // If we search for a message, we treat all threads as unfolded
    if (!disableFolding && !search) {
      const is_thread = isThread(message, numChildren);
      const is_folded = is_thread && isFolded(messages, message, account_id);
      const is_thread_body = is_thread && message.get("reply_to") != null;
      const folded = is_thread && is_folded && is_thread_body;
      if (folded) {
        numFolded++;
        continue;
      }
    }

    const reply_to = message.get("reply_to");
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

interface NotShowingProps {
  num: number;
  search: string;
  filterRecentH: number;
  actions;
  showing;
}

function NotShowing({
  num,
  search,
  filterRecentH,
  actions,
  showing,
}: NotShowingProps) {
  if (num <= 0) return null;

  const timespan =
    filterRecentH > 0 ? hoursToTimeIntervalHuman(filterRecentH) : null;

  return (
    <Alert
      style={{ margin: "5px" }}
      showIcon
      type="warning"
      message={
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ flex: 1 }}>
            WARNING: Hiding {num} {plural(num, "message")} in threads
            {search.trim()
              ? ` that ${
                  num != 1 ? "do" : "does"
                } not match search for '${search.trim()}'`
              : ""}
            {timespan
              ? ` ${
                  search.trim() ? "and" : "that"
                } were not sent in the past ${timespan}`
              : ""}
            . Showing {showing} {plural(showing, "message")}.
          </b>
          <Button
            onClick={() => {
              actions.clearAllFilters();
            }}
          >
            <Icon name="close-circle-filled" style={{ color: "#888" }} /> Clear
          </Button>
        </div>
      }
    />
  );
}

const NEW_MESSAGES_DIVIDER_STYLE: CSSProperties = {
  margin: "8px 15px",
  borderColor: COLORS.ANTD_RED_WARN,
  color: COLORS.ANTD_RED_WARN,
  fontSize: "12px",
  fontWeight: 500,
};

export function MessageList({
  messages,
  account_id,
  virtuosoRef,
  sortedDates,
  user_map,
  project_id,
  path,
  fontSize,
  selectedHashtags,
  actions,
  costEstimate,
  manualScrollRef,
  mode,
  selectedDate,
  numChildren,
  singleThreadView,
  lastReadDate,
  selectedThread,
}: {
  messages: ChatMessages;
  account_id: string;
  user_map;
  mode;
  sortedDates;
  virtuosoRef?;
  project_id?: string;
  path?: string;
  fontSize?: number;
  selectedHashtags?;
  actions?: ChatActions;
  costEstimate?: CostEstimate;
  manualScrollRef?;
  selectedDate?: string;
  numChildren?: NumChildren;
  singleThreadView?: boolean;
  lastReadDate?: number;
  selectedThread?: string;
}) {
  const virtuosoHeightsRef = useRef<{ [index: number]: number }>({});

  // Find the index of the first unread message (message after lastReadDate).
  // Used for both initial scroll and the "new messages" divider.
  const firstUnreadIndex = useMemo(() => {
    if (lastReadDate == null || sortedDates.length === 0) return -1;
    for (let i = 0; i < sortedDates.length; i++) {
      const dateMs = parseFloat(sortedDates[i]);
      if (dateMs > lastReadDate) return i;
    }
    return -1; // all messages are read
  }, [lastReadDate, sortedDates]);

  // Track the lastReadDate at the time the thread was opened so the divider
  // stays stable (doesn't disappear as the user scrolls and updates lastread).
  const initialLastReadRef = useRef<number | undefined>(undefined);
  const prevThreadRef = useRef<string | undefined>(undefined);
  if (selectedThread !== prevThreadRef.current) {
    // thread changed – capture the current lastread as the stable divider position
    initialLastReadRef.current = lastReadDate;
    prevThreadRef.current = selectedThread;
  }

  const stableFirstUnreadIndex = useMemo(() => {
    const stableLastRead = initialLastReadRef.current;
    if (stableLastRead == null || sortedDates.length === 0) return -1;
    for (let i = 0; i < sortedDates.length; i++) {
      const dateMs = parseFloat(sortedDates[i]);
      if (dateMs > stableLastRead) return i;
    }
    return -1;
  }, [sortedDates]);

  // Initial scroll: when a thread with a lastread position opens, scroll to
  // the last-read message centered in the viewport (not to the bottom).
  const initialScrollDoneRef = useRef<string | undefined>(undefined);
  // Suppress lastread updates during programmatic scrolling (initial position,
  // scrollToIndex) so we don't mark messages as read before the user scrolls.
  const suppressLastReadRef = useRef(false);
  // Track the last visible endIndex so we can replay it after suppression
  // ends (for threads where all messages fit in the viewport).
  const lastEndIndexRef = useRef(-1);
  // Store timer IDs so we can cancel them on thread switch / unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Compute the initial scroll index once per thread (stable across
  // re-renders as sortedDates grows during async loading). Reset when
  // selectedThread changes so each thread gets its own initial position.
  const initialIndexRef = useRef<{
    thread: string | undefined;
    index: number | null;
  }>({
    thread: undefined,
    index: null,
  });
  if (initialIndexRef.current.thread !== selectedThread) {
    // Thread changed — reset so we recompute for the new thread
    initialIndexRef.current = { thread: selectedThread, index: null };
  }
  if (initialIndexRef.current.index == null && sortedDates.length > 0) {
    if (lastReadDate == null) {
      initialIndexRef.current.index = Math.max(sortedDates.length - 1, 0);
    } else if (firstUnreadIndex > 0) {
      initialIndexRef.current.index = firstUnreadIndex - 1;
    } else {
      initialIndexRef.current.index = Math.max(sortedDates.length - 1, 0);
    }
  }
  const initialIndex =
    initialIndexRef.current.index ?? Math.max(sortedDates.length - 1, 0);

  // Include selectedThread in the cache key so switching threads doesn't
  // restore a stale scroll position from a different thread.
  const cacheId = selectedThread
    ? `${project_id}${path}:${selectedThread}`
    : `${project_id}${path}`;
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId,
    initialState: { index: initialIndex, offset: 0 },
  });

  // When a thread with unread messages opens, scroll to the first unread
  // message. For "all read" threads, Virtuoso's initialTopMostItemIndex
  // (from the cache or initialState) handles positioning — no override needed.
  // Note: the Virtuoso component uses key={cacheId} so it remounts on thread
  // switch, which means initialTopMostItemIndex is respected each time.
  useEffect(() => {
    const threadId = selectedThread ?? "__none__";
    if (initialScrollDoneRef.current === threadId) return;
    // Don't mark as done until messages have loaded (handles page refresh)
    if (sortedDates.length === 0) return;
    initialScrollDoneRef.current = threadId;

    // Cancel any pending timers from a previous thread
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    // Always suppress lastread updates during initial positioning to prevent
    // the first rangeChanged from marking messages as read before the user
    // has scrolled. This applies to both threads with lastread timestamps
    // and legacy threads that only have the old read-* counter.
    suppressLastReadRef.current = true;

    // After suppression ends, update lastread for whatever is currently
    // visible. This handles threads where all messages fit in the viewport
    // and no further scroll events will fire.
    const replayVisibleRange = (retries = 0) => {
      if (
        !selectedThread ||
        !actions?.updateLastRead ||
        sortedDates.length === 0
      ) {
        return;
      }
      if (lastEndIndexRef.current < 0) {
        // Virtuoso hasn't fired rangeChanged yet — retry briefly
        if (retries < 3) {
          timersRef.current.push(
            setTimeout(() => replayVisibleRange(retries + 1), 200),
          );
        }
        return;
      }
      const visibleDateStr =
        sortedDates[Math.min(lastEndIndexRef.current, sortedDates.length - 1)];
      if (visibleDateStr) {
        const visibleDateMs = parseFloat(visibleDateStr);
        if (Number.isFinite(visibleDateMs)) {
          actions.updateLastRead(selectedThread, visibleDateMs);
        }
      }
    };

    if (lastReadDate != null && firstUnreadIndex > 0) {
      // Scroll to the first unread message, aligned to center so the divider is visible
      timersRef.current.push(
        setTimeout(() => {
          virtuosoRef?.current?.scrollToIndex({
            index: Math.max(firstUnreadIndex - 1, 0),
            align: "center",
          });
          // Re-enable lastread tracking after the scroll settles.
          // Use a longer delay so the "New messages" divider stays visible
          // briefly before being cleared by the lastread update.
          timersRef.current.push(
            setTimeout(() => {
              suppressLastReadRef.current = false;
              replayVisibleRange();
            }, 1500),
          );
        }, 50),
      );
    } else {
      // All read or legacy thread — re-enable after initial render settles,
      // then replay the visible range so threads where all messages fit in
      // the viewport get their lastread timestamp set (clearing the badge).
      timersRef.current.push(
        setTimeout(() => {
          suppressLastReadRef.current = false;
          replayVisibleRange();
        }, 200),
      );
    }

    // Cleanup: cancel timers on thread switch or unmount
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [selectedThread, lastReadDate, firstUnreadIndex, sortedDates.length]);

  // Throttled scroll tracking: update lastread timestamp as user scrolls.
  // 100ms throttle so the unread badge counts down responsively while scrolling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const throttledUpdateLastRead = useCallback(
    throttle(
      (threadKey: string, dateMs: number) => {
        actions?.updateLastRead?.(threadKey, dateMs);
      },
      100,
      { leading: true, trailing: true },
    ),
    [actions],
  );

  // Cancel any pending throttled call on unmount to avoid fire-after-unmount.
  useEffect(() => {
    return () => throttledUpdateLastRead.cancel();
  }, [throttledUpdateLastRead]);

  const handleRangeChanged = useCallback(
    ({ endIndex }: { startIndex: number; endIndex: number }) => {
      lastEndIndexRef.current = endIndex;
      if (manualScrollRef) {
        manualScrollRef.current = endIndex < sortedDates.length - 1;
      }
      // Update lastread based on the last visible message, but only for
      // user-driven scrolling (not initial programmatic positioning).
      if (
        selectedThread &&
        actions?.updateLastRead &&
        sortedDates.length > 0 &&
        !suppressLastReadRef.current
      ) {
        const visibleDateStr =
          sortedDates[Math.min(endIndex, sortedDates.length - 1)];
        if (visibleDateStr) {
          const visibleDateMs = parseFloat(visibleDateStr);
          if (Number.isFinite(visibleDateMs)) {
            throttledUpdateLastRead(selectedThread, visibleDateMs);
          }
        }
      }
    },
    [selectedThread, actions, sortedDates, throttledUpdateLastRead],
  );

  return (
    <Virtuoso
      key={cacheId}
      ref={virtuosoRef}
      totalCount={sortedDates.length + 1}
      itemSize={(el) => {
        // see comment in jupyter/cell-list.tsx
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
        const date = sortedDates[index];
        const message: ChatMessageTyped | undefined = messages.get(date);
        if (message == null) {
          // shouldn't happen, but make code robust to such a possibility.
          // if it happens, fix it.
          console.warn("empty message", { date, index, sortedDates });
          return <div style={{ height: "30px" }} />;
        }

        // only do threading if numChildren is defined.  It's not defined,
        // e.g., when viewing past versions via TimeTravel.
        const is_thread = numChildren != null && isThread(message, numChildren);
        // optimization: only threads can be folded, so don't waste time
        // checking on folding state if it isn't a thread.
        const is_folded =
          !singleThreadView &&
          is_thread &&
          isFolded(messages, message, account_id);
        const is_thread_body = is_thread && message.get("reply_to") != null;
        const h = virtuosoHeightsRef.current?.[index];

        // Show a "New messages" divider before the first unread message.
        // Keep it visible until the user has scrolled to the bottom (read all
        // messages), so it doesn't vanish the instant they scroll past it.
        const showNewMessagesDivider =
          stableFirstUnreadIndex >= 0 &&
          index === stableFirstUnreadIndex &&
          (lastReadDate == null ||
            lastReadDate < parseFloat(sortedDates[sortedDates.length - 1]));

        return (
          <div
            style={{
              overflow: "hidden",
              paddingTop: index == 0 ? "20px" : undefined,
            }}
          >
            {showNewMessagesDivider && (
              <Divider style={NEW_MESSAGES_DIVIDER_STYLE}>New messages</Divider>
            )}
            <DivTempHeight height={h ? `${h}px` : undefined}>
              <Message
                messages={messages}
                numChildren={numChildren?.[message.get("date").valueOf()]}
                key={date}
                index={index}
                account_id={account_id}
                user_map={user_map}
                message={message}
                selected={date == selectedDate}
                project_id={project_id}
                path={path}
                font_size={fontSize}
                selectedHashtags={selectedHashtags}
                actions={actions}
                is_thread={is_thread}
                is_folded={is_folded}
                is_thread_body={is_thread_body}
                is_prev_sender={isPrevMessageSender(
                  index,
                  sortedDates,
                  messages,
                )}
                show_avatar={!isNextMessageSender(index, sortedDates, messages)}
                mode={mode}
                get_user_name={(account_id: string | undefined) =>
                  // ATTN: this also works for LLM chat bot IDs, not just account UUIDs
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
                  messages.getIn([sortedDates[index + 1], "reply_to"]) ==
                    null &&
                  // Resolved threads are read-only archives: hide the
                  // per-thread Reply button even in all-threads view, so
                  // the only way to "continue" the discussion is the
                  // ResolvedThreadPanel's "Start new chat thread" flow.
                  !isThreadResolved({
                    date: parseFloat(date),
                    messages,
                  })
                }
                costEstimate={costEstimate}
                threadViewMode={singleThreadView}
              />
            </DivTempHeight>
          </div>
        );
      }}
      rangeChanged={handleRangeChanged}
      {...virtuosoScroll}
    />
  );
}
