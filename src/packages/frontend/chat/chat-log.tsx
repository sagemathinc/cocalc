/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

import { Alert } from "antd";
import { List, Set as immutableSet } from "immutable";
import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { chatBotName, isChatBot } from "@cocalc/frontend/account/chatbot";
import {
  TypedMap,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { VisibleMDLG } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { HashtagBar } from "@cocalc/frontend/editors/task-editor/hashtag-bar";
import {
  cmp,
  parse_hashtags,
  search_match,
  search_split,
} from "@cocalc/util/misc";
import { ChatActions, getRootMessage } from "./actions";
import Composing from "./composing";
import Message from "./message";
import { ChatMessageTyped, ChatMessages, MessageHistory, Mode } from "./types";
import { getSelectedHashtagsSearch, newest_content } from "./utils";

interface Props {
  project_id: string; // used to render links more effectively
  path: string;
  mode: Mode;
  scrollToBottomRef?: MutableRefObject<(force?: boolean) => void>;
}

export function ChatLog(props: Readonly<Props>) {
  const { project_id, path, scrollToBottomRef, mode } = props;
  const actions: ChatActions = useActions(project_id, path);
  const messages = useRedux(["messages"], project_id, path) as ChatMessages;
  const fontSize = useRedux(["font_size"], project_id, path);
  const scrollToBottom = useRedux(["scrollToBottom"], project_id, path);

  // see similar code in task list:
  const selectedHashtags0 = useRedux(["selectedHashtags"], project_id, path);
  const { selectedHashtags, selectedHashtagsSearch } = useMemo(() => {
    return getSelectedHashtagsSearch(selectedHashtags0);
  }, [selectedHashtags0]);

  const search =
    useRedux(["search"], project_id, path) + selectedHashtagsSearch;

  useEffect(() => {
    scrollToBottomRef?.current?.(true);
  }, [search]);

  useEffect(() => {
    if (scrollToBottom == null) return;
    if (scrollToBottom == -1) {
      scrollToBottomRef?.current?.(true);
    } else {
      // console.log({ scrollToBottom }, " -- not implemented");
      virtuosoRef.current?.scrollToIndex({ index: scrollToBottom });
    }
    actions.setState({ scrollToBottom: undefined });
  }, [scrollToBottom]);

  const today = useRedux(["today"], project_id, path);
  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const sortedDates = useMemo<string[]>(() => {
    const dates = getSortedDates(messages, search, account_id);
    if (today) {
      const cutoff = Date.now() - 1000 * 24 * 60 * 60;
      return dates.filter((x) => parseInt(x) >= cutoff);
    }
    return dates;
  }, [messages, search, project_id, path, today]);

  const visibleHashtags = useMemo(() => {
    let X = immutableSet<string>([]);
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
      virtuosoRef.current?.scrollToIndex({ index: 99999999999999999999 });
      // sometimes scrolling to bottom is requested before last entry added,
      // so we do it again in the next render loop.  This seems needed mainly
      // for side chat when there is little vertical space.
      setTimeout(
        () =>
          virtuosoRef.current?.scrollToIndex({ index: 99999999999999999999 }),
        0,
      );
    };
  }, [scrollToBottomRef != null]);

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}${path}`,
    initialState: { index: messages.size - 1, offset: 0 }, // starts scrolled to the newest message.
  });

  return (
    <>
      {visibleHashtags.size > 0 && (
        <VisibleMDLG>
          <HashtagBar
            actions={{
              set_hashtag_state: (tag, state) => {
                actions.setHashtagState(tag, state);
              },
            }}
            selected_hashtags={selectedHashtags0}
            hashtags={visibleHashtags}
          />
        </VisibleMDLG>
      )}
      {messages != null && (
        <NotShowing
          num={messages.size - sortedDates.length}
          search={search}
          today={today}
        />
      )}
      <Virtuoso
        ref={virtuosoRef}
        totalCount={sortedDates.length}
        overscan={10000}
        itemContent={(index) => {
          const date = sortedDates[index];
          const message: ChatMessageTyped | undefined = messages.get(date);
          if (message == null) {
            // shouldn't happen.  But we should be robust to such a possibility.
            return <div style={{ height: "1px" }} />;
          }

          const is_thread = isThread(messages, message);
          const is_folded = isFolded(messages, message, account_id);
          const is_thread_body = message.get("reply_to") != null;

          return (
            <div style={{ overflow: "hidden" }}>
              <Message
                key={date}
                index={index}
                account_id={account_id}
                user_map={user_map}
                message={message}
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
                is_next_sender={isNextMessageSender(
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
                scroll_into_view={() =>
                  virtuosoRef.current?.scrollIntoView({ index })
                }
                allowReply={
                  messages.getIn([sortedDates[index + 1], "reply_to"]) == null
                }
              />
            </div>
          );
        }}
        rangeChanged={({ endIndex }) => {
          // manually scrolling if NOT at the bottom.
          manualScrollRef.current = endIndex < sortedDates.length - 1;
        }}
        {...virtuosoScroll}
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

// NOTE: I removed search including send name, since that would
// be slower and of questionable value.
function searchMatches(message: ChatMessageTyped, searchTerms): boolean {
  const first = message.get("history", List()).first() as
    | TypedMap<MessageHistory>
    | undefined;
  if (first == null) return false;
  return search_match(first.get("content", ""), searchTerms);
}

function isThread(messages: ChatMessages, message: ChatMessageTyped) {
  if (message.get("reply_to") != null) {
    return true;
  }
  return messages.some(
    (m) => m.get("reply_to") === message.get("date").toISOString(),
  );
}

function isFolded(
  messages: ChatMessages,
  message: ChatMessageTyped,
  account_id?: string,
) {
  if (account_id == null) return false;
  const rootMsg = getRootMessage(message.toJS(), messages);
  return rootMsg?.get("folding")?.includes(account_id) ?? false;
}

// messages is an immutablejs map from
//   - timestamps (ms since epoch as string)
// to
//   - message objects {date: , event:, history, sender_id, reply_to}
//
// It was very easy to sort these before reply_to, which complicates things.
export function getSortedDates(
  messages,
  search?: string,
  account_id?: string,
): string[] {
  let m = messages;
  if (m == null) return [];
  if (search) {
    const searchTerms = search_split(search);
    m = m.filter((message) => searchMatches(message, searchTerms));
  }

  const v: [date: number, reply_to: number | undefined][] = [];
  for (const [date, message] of m) {
    if (message == null) continue;

    const is_thread = isThread(messages, message);
    const is_folded = isFolded(messages, message, account_id);
    const is_thread_body = message.get("reply_to") != null;
    const folded = is_thread && is_folded && is_thread_body;
    if (folded) continue;

    const reply_to = message.get("reply_to");
    v.push([
      parseInt(date),
      reply_to != null ? new Date(reply_to).valueOf() : undefined,
    ]);
  }
  v.sort(cmpMessages);
  const w = v.map((z) => `${z[0]}`);
  return w;
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

function NotShowing({ num, search, today }) {
  if (num <= 0) return null;
  return (
    <Alert
      style={{ margin: "0 5px" }}
      type="warning"
      key="not_showing"
      message={
        <b>
          WARNING: Hiding {num} chats{" "}
          {search.trim()
            ? `that do not match search for '${search.trim()}'`
            : ""}
          {today
            ? ` ${search.trim() ? "and" : "that"} were not sent today`
            : ""}
          .
        </b>
      }
    />
  );
}
