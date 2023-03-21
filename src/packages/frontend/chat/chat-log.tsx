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
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { HashtagBar } from "@cocalc/frontend/editors/task-editor/hashtag-bar";
import { newest_content, getSelectedHashtagsSearch } from "./utils";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";

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
  const font_size = useRedux(["font_size"], project_id, path);

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
  const sorted_dates = useMemo<string[]>(() => {
    return getSortedDates(messages, search);
  }, [messages, search, project_id, path]);

  const visibleHashtags = useMemo(() => {
    let X = immutableSet<string>([]);
    for (const date of sorted_dates) {
      const message = messages.get(date);
      const value = newest_content(message);
      for (const x of parse_hashtags(value)) {
        const tag = value.slice(x[0] + 1, x[1]).toLowerCase();
        X = X.add(tag);
      }
    }
    return X;
  }, [messages, sorted_dates]);

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
        <NotShowing num={messages.size - sorted_dates.length} search={search} />
      )}
      <Virtuoso
        ref={virtuosoRef}
        totalCount={sorted_dates.length}
        itemContent={(index) => {
          const date = sorted_dates[index];
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
                font_size={font_size}
                selectedHashtags={selectedHashtags}
                actions={actions}
                is_prev_sender={is_prev_message_sender(
                  index,
                  sorted_dates,
                  messages
                )}
                is_next_sender={is_next_message_sender(
                  index,
                  sorted_dates,
                  messages
                )}
                show_avatar={
                  show_heads &&
                  !is_next_message_sender(index, sorted_dates, messages)
                }
                include_avatar_col={show_heads}
                get_user_name={(account_id) =>
                  getUserName(user_map, account_id)
                }
                scroll_into_view={() =>
                  virtuosoRef.current?.scrollIntoView({ index })
                }
                allowReply={
                  messages.getIn([sorted_dates[index + 1], "reply_to"]) == null
                }
              />
            </div>
          );
        }}
        rangeChanged={({ endIndex }) => {
          // manually scrolling if NOT at the bottom.
          manualScrollRef.current = endIndex < sorted_dates.length - 1;
        }}
        {...virtuosoScroll}
      />
      <Composing
        project_id={project_id}
        path={path}
        account_id={account_id}
        user_map={user_map}
      />
    </>
  );
}

function is_next_message_sender(
  index: number,
  dates: string[],
  messages: Map<string, MessageMap>
): boolean {
  if (index + 1 === dates.length) {
    return false;
  }
  const current_message = messages.get(dates[index]);
  const next_message = messages.get(dates[index + 1]);
  return (
    current_message != null &&
    next_message != null &&
    current_message.get("sender_id") === next_message.get("sender_id")
  );
}

function is_prev_message_sender(
  index: number,
  dates: string[],
  messages: Map<string, MessageMap>
): boolean {
  if (index === 0) {
    return false;
  }
  const current_message = messages.get(dates[index]);
  const prev_message = messages.get(dates[index - 1]);
  return (
    current_message != null &&
    prev_message != null &&
    current_message.get("sender_id") === prev_message.get("sender_id")
  );
}

// NOTE: I removed search including send name, since that would
// be slower and of questionable value.
function search_matches(message: MessageMap, search_terms): boolean {
  const first = message.get("history", List()).first();
  if (first == null) return false;
  return search_match(first.get("content", ""), search_terms);
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
    const search_terms = search_split(search);
    m = m.filter((message) => search_matches(message, search_terms));
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

export function getUserName(user_map, account_id: string): string {
  if (account_id == "chatgpt") return "ChatGPT";
  if (user_map == null) return "Unknown";
  const account = user_map.get(account_id);
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

function Composing({ project_id, path, account_id, user_map }) {
  const drafts = useRedux(["drafts"], project_id, path);

  if (!drafts || drafts.size == 0) {
    return null;
  }

  const v: JSX.Element[] = [];
  const cutoff = new Date().valueOf() - 1000 * 30; // 30s
  for (const [sender_id] of drafts) {
    if (account_id == sender_id) {
      // this is us
      continue;
    }
    const record = drafts.get(sender_id);
    if (record.get("date") != 0) {
      // editing an already sent message, rather than composing a new one.
      // This is indicated elsewhere (at that message).
      continue;
    }
    if (record.get("active") < cutoff || !record.get("input").trim()) {
      continue;
    }
    v.push(
      <div
        key={sender_id}
        style={{ margin: "5px", color: "#666", textAlign: "center" }}
      >
        <Avatar size={20} account_id={sender_id} />
        <span style={{ marginLeft: "15px" }}>
          {getUserName(user_map, sender_id)} is writing a message...
        </span>
        {sender_id == "chatgpt" && (
          <ProgressEstimate
            style={{ marginLeft: "15px", maxWidth: "600px" }}
            seconds={45}
          />
        )}
      </div>
    );
    // NOTE: We use a longer chatgpt estimate here than in the frontend nextjs
    // app, since the nature of questions when you're fully using cocalc
    // is that they tend to be much deeper.
  }
  if (v.length == 0) return null;
  return <div>{v}</div>;
}
