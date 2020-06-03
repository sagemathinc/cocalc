/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

import { List, Map } from "immutable";
import { Actions, React, useMemo } from "../app-framework";
import { Alert } from "../antd-bootstrap";
import { WindowedList } from "../r_misc/windowed-list";
import { Message } from "./message";
import { search_match, search_split } from "smc-util/misc";

type MessageMap = Map<string, any>;

// We're doing this since actual ChatActions is still in coffeescript.
interface ChatActions extends Actions<{}> {}

interface ChatLogProps {
  messages: Map<string, MessageMap>; // immutable js map string --> message; keys are the string representation of ms since epoch.
  user_map?: Map<string, Map<string, any>>; // immutable js map {collaborators} --> account info
  account_id: string;
  project_id?: string; // used to render links more effectively
  path?: string;
  font_size: number;
  actions?: ChatActions;
  show_heads?: boolean;
  focus_end?(e: any): void;
  saved_mesg?: string;
  set_scroll?: Function;
  search?: string;
  windowed_list_ref?: React.RefObject<WindowedList>;
}

export const ChatLog: React.FC<ChatLogProps> = (props) => {
  const { messages, search } = props;

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
  }, [messages, search, props.project_id, props.path]);

  function get_user_name(account_id: string): string {
    if (props.user_map == null) return "Unknown";
    const account = props.user_map.get(account_id);
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
        account_id={props.account_id}
        history={message.get("history")}
        user_map={props.user_map}
        message={message}
        date={date}
        project_id={props.project_id}
        path={props.path}
        font_size={props.font_size}
        actions={props.actions}
        saved_mesg={
          message.getIn(["editing", props.account_id])
            ? props.saved_mesg
            : undefined
        }
        sender_name={sender_name}
        editor_name={last_editor_name}
        focus_end={props.focus_end}
        set_scroll={props.set_scroll}
        is_prev_sender={is_prev_message_sender(i, sorted_dates, messages)}
        is_next_sender={is_next_message_sender(i, sorted_dates, messages)}
        show_avatar={
          props.show_heads && !is_next_message_sender(i, sorted_dates, messages)
        }
        include_avatar_col={props.show_heads}
        get_user_name={get_user_name}
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
      props.windowed_list_ref?.current != null &&
      !(props.windowed_list_ref.current as any).chat_scroll_to_bottom
    ) {
      (props.windowed_list_ref.current as any).chat_manual_scroll = true;
    }
  }

  return (
    <>
      {render_not_showing()}
      <WindowedList
        ref={props.windowed_list_ref}
        overscan_row_count={25}
        estimated_row_size={62}
        row_count={sorted_dates.length}
        row_renderer={row_renderer}
        row_key={row_key}
        cache_id={`${props.project_id}${props.path}`}
        on_scroll={on_scroll}
      />
    </>
  );
};

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
