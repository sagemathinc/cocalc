/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

import { VisibleMDLG } from "@cocalc/frontend/components";
import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { List, Map, Set as immutableSet } from "immutable";
import {
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Alert } from "antd";
import Message from "./message";
import {
  cmp,
  parse_hashtags,
  search_match,
  search_split,
} from "@cocalc/util/misc";
import { ChatActions } from "./actions";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { HashtagBar } from "@cocalc/frontend/editors/task-editor/hashtag-bar";
import { newest_content, getSelectedHashtagsSearch } from "./utils";
import Composing from "./composing";

type MessageMap = Map<string, any>;

interface Props {
  project_id: string; // used to render links more effectively
  path: string;
  show_heads: boolean;
  scrollToBottomRef?: MutableRefObject<(force?: boolean) => void>;
}

export function ChatLog({
  project_id,
  path,
  scrollToBottomRef,
  show_heads,
}: Props) {
  const actions: ChatActions = useActions(project_id, path);
  const messages = useRedux(["messages"], project_id, path);
  const fontSize = useRedux(["font_size"], project_id, path);

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

  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const sortedDates = useMemo<string[]>(() => {
    return getSortedDates(messages, search);
  }, [messages, search, project_id, path]);

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
        0
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
        <NotShowing num={messages.size - sortedDates.length} search={search} />
      )}
      <Virtuoso
        ref={virtuosoRef}
        totalCount={sortedDates.length}
        itemContent={(index) => {
          const date = sortedDates[index];
          const message: MessageMap | undefined = messages.get(date);
          if (message == null) {
            // shouldn't happen.  But we should be robust to such a possibility.
            return <div style={{ height: "1px" }} />;
          }
          return (
            <div style={{ overflow: "hidden" }}>
              <Message
                key={date}
                account_id={account_id}
                user_map={user_map}
                message={message}
                project_id={project_id}
                path={path}
                font_size={fontSize}
                selectedHashtags={selectedHashtags}
                actions={actions}
                is_prev_sender={isPrevMessageSender(
                  index,
                  sortedDates,
                  messages
                )}
                is_next_sender={isNextMessageSender(
                  index,
                  sortedDates,
                  messages
                )}
                show_avatar={
                  show_heads &&
                  !isNextMessageSender(index, sortedDates, messages)
                }
                include_avatar_col={show_heads}
                get_user_name={(account_id) =>
                  getUserName(user_map, account_id)
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
  messages: Map<string, MessageMap>
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
  messages: Map<string, MessageMap>
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
function searchMatches(message: MessageMap, searchTerms): boolean {
  const first = message.get("history", List()).first();
  if (first == null) return false;
  return search_match(first.get("content", ""), searchTerms);
}

// messages is an immutablejs map from
//   - timestamps (ms since epoch as string)
// to
//   - message objects {date: , event:, history, sender_id, reply_to}
//
// It was very easy to sort these before reply_to, which complicates things.
export function getSortedDates(messages, search?: string): string[] {
  let m = messages;
  if (m == null) return [];
  if (search) {
    const searchTerms = search_split(search);
    m = m.filter((message) => searchMatches(message, searchTerms));
  }
  const v: [date: number, reply_to: number | undefined][] = [];
  for (const [date, message] of m) {
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
  if (accountId == "chatgpt") return "ChatGPT";
  if (userMap == null) return "Unknown";
  const account = userMap.get(accountId);
  if (account == null) return "Unknown";
  return account.get("first_name", "") + " " + account.get("last_name", "");
}

function NotShowing({ num, search }) {
  if (num <= 0) return null;
  return (
    <Alert
      style={{ margin: "0 5px" }}
      type="warning"
      key="not_showing"
      message={
        <b>
          WARNING: Hiding {num} chats that do not match search for '
          {search.trim()}'.
        </b>
      }
    />
  );
}
