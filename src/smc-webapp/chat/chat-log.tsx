/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render all the messages in the chat.
*/

import { List, Map } from "immutable";
import { Actions, React, Component, Rendered } from "../app-framework";
import { Alert } from "react-bootstrap";
import { WindowedList } from "../r_misc/windowed-list";
import { Message } from "../smc_chat";
import { search_match, search_split } from "smc-util/misc";

type MessageMap = Map<string, any>;

// We're doing this since actual ChatActions is still in coffeescript.
interface ChatActions extends Actions<{}> {}

interface ChatLogProps {
  messages: Map<string, MessageMap>; // immutable js map string --> message; keys are the string representation of ms since epoch.
  user_map?: Map<string, Map<string, any>>; // immutable js map {collaborators} --> account info
  account_id: string;
  project_id?: string; // used to render links more effectively
  file_path?: string; // used to render links
  font_size?: number;
  actions?: ChatActions;
  show_heads?: boolean;
  focus_end?(e: any): void;
  saved_mesg?: string;
  set_scroll?: Function;
  search?: string;
  windowed_list_ref?: React.RefObject<WindowedList>;
}

export class ChatLog extends Component<ChatLogProps> {
  private sorted_dates: string[] | undefined = undefined;

  constructor(props) {
    super(props);
    this.get_user_name = this.get_user_name.bind(this);
  }

  public shouldComponentUpdate(nextProps: ChatLogProps): boolean {
    if (
      this.props.messages !== nextProps.messages ||
      this.props.search !== nextProps.search
    ) {
      delete this.sorted_dates; // clear the cache.
    }

    return (
      this.props.messages !== nextProps.messages ||
      this.props.search !== nextProps.search ||
      this.props.user_map !== nextProps.user_map ||
      this.props.account_id !== nextProps.account_id ||
      this.props.saved_mesg !== nextProps.saved_mesg
    );
  }

  private get_user_name(account_id: string): string {
    if (this.props.user_map == null) return "Unknown";
    const account = this.props.user_map.get(account_id);
    if (account == null) return "Unknown";
    return account.get("first_name", "") + " " + account.get("last_name", "");
  }

  // Given the date of the message as an ISO string, return rendered version.
  private render_message(date: string, i: number): Rendered {
    const message: MessageMap | undefined = this.props.messages.get(date);
    if (message === undefined) return;
    const sorted_dates = this.get_sorted_dates();
    const first: Map<string, any> = message.get("history", List()).first();
    const last_editor_name: string = this.get_user_name(
      first != null ? first.get("author_id") : undefined
    );
    const sender_name = this.get_user_name(message.get("sender_id"));
    return (
      <Message
        key={date}
        account_id={this.props.account_id}
        history={message.get("history")}
        user_map={this.props.user_map}
        message={message}
        date={date}
        project_id={this.props.project_id}
        file_path={this.props.file_path}
        font_size={this.props.font_size}
        actions={this.props.actions}
        saved_mesg={
          message.getIn(["editing", this.props.account_id])
            ? this.props.saved_mesg
            : undefined
        }
        sender_name={sender_name}
        editor_name={last_editor_name}
        focus_end={this.props.focus_end}
        set_scroll={this.props.set_scroll}
        is_prev_sender={is_prev_message_sender(
          i,
          sorted_dates,
          this.props.messages
        )}
        is_next_sender={is_next_message_sender(
          i,
          sorted_dates,
          this.props.messages
        )}
        show_avatar={
          this.props.show_heads &&
          !is_next_message_sender(i, sorted_dates, this.props.messages)
        }
        include_avatar_col={this.props.show_heads}
        get_user_name={this.get_user_name}
      />
    );
  }

  private row_renderer({ key, index }): Rendered {
    return this.render_message(key, index);
  }

  private row_key(index): string | undefined {
    return this.get_sorted_dates()[index];
  }

  private get_sorted_dates(): string[] {
    if (this.sorted_dates === undefined) {
      // WARNING: This code is technically wrong since the keys are the string
      // representations of ms since epoch.  However, it won't fail until over
      // 200 years from now, so we leave it as is.
      let messages = this.props.messages;
      if (this.props.search) {
        const search_terms = search_split(this.props.search.toLowerCase());
        messages = messages.filter((message) =>
          search_matches(message, search_terms)
        );
      }
      this.sorted_dates = messages.keySeq().sort().toJS();
    }
    return this.sorted_dates;
  }

  private render_not_showing(): Rendered {
    const sorted_dates = this.get_sorted_dates();
    const not_showing = this.props.messages.size - sorted_dates.length;
    if (not_showing <= 0) return;
    return (
      <Alert bsStyle="warning" key="not_showing">
        <b>
          WARNING: Hiding {not_showing} chats that do not match search for '
          {this.props.search}'.
        </b>
      </Alert>
    );
  }

  private on_scroll({ scrollTop, scrollHeight, clientHeight }): void {
    if (
      this.props.windowed_list_ref != null &&
      this.props.windowed_list_ref.current != null &&
      !(this.props.windowed_list_ref.current as any).chat_scroll_to_bottom
    ) {
      if (scrollTop + clientHeight + 30 >= scrollHeight) {
        delete (this.props.windowed_list_ref.current as any).chat_manual_scroll;
      } else {
        (this.props.windowed_list_ref.current as any).chat_manual_scroll = true;
      }
    }
  }

  public render(): Rendered {
    return (
      <>
        {this.render_not_showing()}
        <WindowedList
          ref={this.props.windowed_list_ref}
          overscan_row_count={15}
          estimated_row_size={62}
          row_count={this.get_sorted_dates().length}
          row_renderer={this.row_renderer.bind(this)}
          row_key={this.row_key.bind(this)}
          cache_id={this.props.actions ? this.props.actions.name : undefined}
          on_scroll={this.on_scroll.bind(this)}
        />
      </>
    );
  }
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
function search_matches(message: MessageMap, search_terms: string[]): boolean {
  const first = message.get("history", List()).first();
  if (first == null) return false;
  return search_match(first.get("content", "").toLowerCase(), search_terms);
}
