/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

import { List, Map } from "immutable";
import { React, useActions, useMemo, useRedux } from "../app-framework";
import { Alert } from "../antd-bootstrap";
import { WindowedList } from "../r_misc/windowed-list";
import { Message } from "./message";
import { search_match, search_split } from "smc-util/misc";
import { ChatActions } from "./actions";

type MessageMap = Map<string, any>;

interface ChatLogProps {
  project_id: string; // used to render links more effectively
  path: string;
  windowed_list_ref?: React.RefObject<WindowedList>;
  show_heads?: boolean;
}

export const ChatLog: React.FC<ChatLogProps> = React.memo(
  ({ project_id, path, windowed_list_ref, show_heads }) => {
    const actions: ChatActions = useActions(project_id, path);
    const messages = useRedux(["messages"], project_id, path);
    const search = useRedux(["search"], project_id, path);
    const user_map = useRedux(["users", "user_map"]);
    const account_id = useRedux(["account", "account_id"]);
    const font_size = useRedux(["account", "font_size"]);
    const sorted_dates = useMemo<string[]>(() => {
      // WARNING: This code is technically wrong since the keys are the string
      // representations of ms since epoch.  However, it won't fail until over
      // 200 years from now, so we leave it to future generations to worry about.
      let m = messages;
      if (search) {
        const search_terms = search_split(search.toLowerCase());
        m = m.filter((message) => search_matches(message, search_terms));
      }
      return m.keySeq().sort().toJS();
    }, [messages, search, project_id, path]);

    function get_user_name(account_id: string): string {
      if (user_map == null) return "Unknown";
      const account = user_map.get(account_id);
      if (account == null) return "Unknown";
      return account.get("first_name", "") + " " + account.get("last_name", "");
    }

    // Given the date of the message as an ISO string, return rendered version.
    function render_message(date: string, i: number): JSX.Element | undefined {
      const message: MessageMap | undefined = messages.get(date);
      if (message === undefined) return;
      const first: Map<string, any> = message.get("history", List()).first();
      const last_editor_name: string = get_user_name(
        first != null ? first.get("author_id") : undefined
      );
      const sender_name = get_user_name(message.get("sender_id"));
      return (
        <Message
          key={date}
          account_id={account_id}
          history={message.get("history")}
          user_map={user_map}
          message={message}
          date={date}
          project_id={project_id}
          path={path}
          font_size={font_size}
          actions={actions}
          sender_name={sender_name}
          editor_name={last_editor_name}
          is_prev_sender={is_prev_message_sender(i, sorted_dates, messages)}
          is_next_sender={is_next_message_sender(i, sorted_dates, messages)}
          show_avatar={
            show_heads && !is_next_message_sender(i, sorted_dates, messages)
          }
          include_avatar_col={show_heads}
          get_user_name={get_user_name}
          scroll_into_view={() => windowed_list_ref?.current?.scrollToRow(i)}
        />
      );
    }

    function row_renderer({ key, index }): JSX.Element | undefined {
      return render_message(key, index);
    }

    function row_key(index): string | undefined {
      return sorted_dates[index];
    }

    function render_not_showing(): JSX.Element | undefined {
      const not_showing = messages.size - sorted_dates.length;
      if (not_showing <= 0) return;
      return (
        <Alert bsStyle="warning" key="not_showing">
          <b>
            WARNING: Hiding {not_showing} chats that do not match search for '
            {search}'.
          </b>
        </Alert>
      );
    }

    function on_scroll(): void {
      // TODO: get rid of this annoying hackish way of passing state.
      if (
        windowed_list_ref?.current != null &&
        !(windowed_list_ref.current as any).chat_scroll_to_bottom
      ) {
        (windowed_list_ref.current as any).chat_manual_scroll = true;
      }
    }

    return (
      <>
        {render_not_showing()}
        <WindowedList
          ref={windowed_list_ref}
          overscan_row_count={25}
          estimated_row_size={62}
          row_count={sorted_dates.length}
          row_renderer={row_renderer}
          row_key={row_key}
          cache_id={`${project_id}${path}`}
          on_scroll={on_scroll}
        />
      </>
    );
  }
);

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
function search_matches(message: MessageMap, search_terms: string[]): boolean {
  const first = message.get("history", List()).first();
  if (first == null) return false;
  return search_match(first.get("content", "").toLowerCase(), search_terms);
}
