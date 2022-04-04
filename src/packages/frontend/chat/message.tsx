/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
const { IS_TOUCH } = require("../feature");

import { Avatar } from "../account/avatar/avatar";
import { is_different, path_split } from "@cocalc/util/misc";
import {
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
} from "./utils";
import { Markdown } from "./markdown";

import { redux, React, useMemo, useRef, useState } from "../app-framework";
import { Icon, Space, TimeAgo, Tip } from "../components";
import { Button } from "../antd-bootstrap";
import { Row, Col } from "antd";
import { get_user_name } from "./chat-log";

import { HistoryTitle, HistoryFooter, History } from "./history";
import { ChatInput } from "./input";
import { ChatActions } from "./actions";

import { Time } from "./time";
import { Name } from "./name";

const BLANK_COLUMN = <Col key={"blankcolumn"} xs={2}></Col>;

interface Props {
  actions?: ChatActions;

  get_user_name: (account_id: string) => string;
  message: Map<string, any>; // immutable.js message object
  account_id: string;
  user_map?: Map<string, any>;
  project_id?: string; // improves relative links if given
  path?: string;
  font_size: number;
  is_prev_sender?: boolean;
  is_next_sender?: boolean;
  show_avatar?: boolean;
  include_avatar_col?: boolean;

  set_scroll?: Function;
  scroll_into_view: () => void; // call to scroll this message into view
}

function areEqual(prevProps, nextProps): boolean {
  return !is_different(prevProps, nextProps, [
    "message",
    "user_map",
    "font_size",
    "show_avatar",
    "include_avatar_col",
    "is_prev_sender",
    "is_next_sender",
  ]);
}

export const Message: React.FC<Props> = React.memo((props) => {
  const [edited_message, set_edited_message] = useState(
    newest_content(props.message)
  );
  // We have to use a ref because of trickiness involving
  // stale closures when submitting the message.
  const edited_message_ref = useRef(edited_message);

  const [show_history, set_show_history] = useState(false);

  const new_changes = useMemo(
    () => edited_message !== newest_content(props.message),
    [props.message] /* note -- edited_message is a function of props.message */
  );

  const history_size = useMemo(
    () => props.message.get("history").size,
    [props.message]
  );

  const isEditing = useMemo(
    () => is_editing(props.message, props.account_id),
    [props.message, props.account_id]
  );

  const editor_name = useMemo(() => {
    return props.get_user_name(
      props.message.get("history")?.first()?.get("author_id")
    );
  }, [props.message]);

  const submitMentionsRef = useRef<Function>();

  function render_toggle_history() {
    const verb = show_history ? "Hide" : "Show";
    return (
      <span>
        <Space />
        <span
          className="small"
          style={{
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onClick={() => toggle_history_chat(!show_history)}
        >
          <Tip
            title="Message History"
            tip={`${verb} history of editing of this message.`}
          >
            <Icon name="history" /> {verb} History
          </Tip>
        </span>
      </span>
    );
  }

  function toggle_history_chat(show: boolean) {
    set_show_history(show);
    props.set_scroll?.();
  }

  function editing_status(is_editing: boolean) {
    let text;
    const other_editors = props.message
      .get("editing")
      .remove(props.account_id)
      .keySeq();
    if (is_editing) {
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = `${props.get_user_name(
          other_editors.first()
        )} is also editing this!`;
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
      } else if (
        history_size !== props.message.get("history").size &&
        new_changes
      ) {
        text = `${editor_name} has updated this message. Esc to discard your changes and see theirs`;
      } else {
        if (IS_TOUCH) {
          text = "You are now editing ...";
        } else {
          text = "You are now editing ... Shift+Enter to submit changes.";
        }
      }
    } else {
      if (other_editors.size === 1) {
        // One person is editing
        text = `${props.get_user_name(
          other_editors.first()
        )} is editing this message`;
      } else if (other_editors.size > 1) {
        // Multiple editors
        text = `${other_editors.size} people are editing this message`;
      } else if (newest_content(props.message).trim() === "") {
        text = `Deleted by ${editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${editor_name}`;
    }

    if (
      !is_editing &&
      other_editors.size === 0 &&
      newest_content(props.message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${editor_name}`;
      return (
        <span className="small">
          {edit}
          <TimeAgo
            date={new Date(props.message.get("history").first()?.get("date"))}
          />
          {name}
        </span>
      );
    }
    return (
      <span className="small">
        {text}
        {is_editing ? (
          <span style={{ margin: "10px 10px 0 10px", display: "inline-block" }}>
            <Button onClick={on_cancel}>Cancel</Button>
            <Space />
            <Button onClick={on_send} bsStyle="success">
              Save (shift+enter)
            </Button>
          </span>
        ) : undefined}
      </span>
    );
  }

  function edit_message() {
    if (
      props.project_id == null ||
      props.path == null ||
      props.actions == null
    ) {
      // no editing functionality of not in a project with a path.
      return;
    }
    props.actions.set_editing(props.message, true);
    props.scroll_into_view();
  }

  function avatar_column() {
    let account = props.user_map?.get(props.message.get("sender_id"))?.toJS?.();
    let style: React.CSSProperties = {};
    if (!props.is_prev_sender) {
      style.marginTop = "22px";
    }
    if (sender_is_viewer(props.account_id, props.message)) {
      style.marginLeft = "15px";
    } else {
      style.marginRight = "15px";
    }

    return (
      <Col key={0} xs={4}>
        <div style={style}>
          {account != null && props.show_avatar ? (
            <Avatar size={40} account_id={account.account_id} />
          ) : undefined}
        </div>
      </Col>
    );
  }

  function content_column() {
    let borderRadius, marginBottom, marginTop: any;
    let value = newest_content(props.message);

    const is_viewers_message = sender_is_viewer(
      props.account_id,
      props.message
    );

    const { background, color, lighten, message_class } = message_colors(
      props.account_id,
      props.message
    );

    const font_size = `${props.font_size}px`;

    if (props.show_avatar) {
      marginBottom = "1vh";
    } else {
      marginBottom = "3px";
    }

    if (!props.is_prev_sender && is_viewers_message) {
      marginTop = "17px";
    }

    if (!props.is_prev_sender && !props.is_next_sender && !show_history) {
      borderRadius = "10px 10px 10px 10px";
    } else if (!props.is_prev_sender) {
      borderRadius = "10px 10px 5px 5px";
    } else if (!props.is_next_sender) {
      borderRadius = "5px 5px 10px 10px";
    }

    const message_style: React.CSSProperties = {
      color,
      background,
      wordWrap: "break-word",
      marginBottom,
      marginTop,
      borderRadius,
      fontSize: font_size,
      padding: "9px",
    };

    return (
      <Col key={1} xs={18}>
        {!props.is_prev_sender &&
        !is_viewers_message &&
        props.message.get("sender_id") ? (
          <Name
            sender_name={props.get_user_name(props.message.get("sender_id"))}
          />
        ) : undefined}
        <div
          style={message_style}
          className="smc-chat-message"
          onDoubleClick={edit_message}
        >
          {!isEditing && (
            <span style={lighten}>
              <Time message={props.message} edit={edit_message} />
            </span>
          )}
          {!isEditing ? (
            <Markdown
              value={value}
              project_id={props.project_id}
              file_path={
                props.path != null ? path_split(props.path).head : undefined
              }
              className={message_class}
            />
          ) : undefined}
          {isEditing ? render_input() : undefined}
          <span>
            {props.message.get("history").size > 1 ||
            props.message.get("editing").size > 0
              ? editing_status(isEditing)
              : undefined}
            {props.message.get("history").size > 1
              ? render_toggle_history()
              : undefined}
          </span>
        </div>
        {show_history && (
          <div>
            <HistoryTitle />
            <History
              history={props.message.get("history")}
              user_map={props.user_map}
            />
            <HistoryFooter />
          </div>
        )}
      </Col>
    );
  }

  function on_send(): void {
    if (props.actions == null) return;
    const mesg = submitMentionsRef.current?.() ?? edited_message_ref.current;
    if (mesg !== newest_content(props.message)) {
      props.actions.send_edit(props.message, mesg);
    } else {
      props.actions.set_editing(props.message, false);
    }
  }

  function on_cancel(): void {
    set_edited_message(newest_content(props.message));
    if (props.actions == null) return;
    props.actions.set_editing(props.message, false);
  }

  // All the render methods
  function render_input() {
    if (props.project_id == null || props.path == null) {
      // should never get into this position
      // when null.
      return;
    }
    return (
      <ChatInput
        input={edited_message}
        submitMentionsRef={submitMentionsRef}
        on_send={on_send}
        height={"auto"}
        onChange={(value) => {
          edited_message_ref.current = value;
          set_edited_message(value);
        }}
      />
    );
  }

  let cols;
  if (props.include_avatar_col) {
    cols = [avatar_column(), content_column(), BLANK_COLUMN];
    // mirror right-left for sender's view
    if (sender_is_viewer(props.account_id, props.message)) {
      cols = cols.reverse();
    }
  } else {
    cols = [content_column(), BLANK_COLUMN];
    // mirror right-left for sender's view
    if (sender_is_viewer(props.account_id, props.message)) {
      cols = cols.reverse();
    }
  }
  return <Row>{cols}</Row>;
}, areEqual);

// Used for exporting chat to markdown file
export function message_to_markdown(message): string {
  let value = newest_content(message);
  const user_map = redux.getStore("users").get("user_map");
  const sender = get_user_name(user_map, message.get("sender_id"));
  const date = message.get("date").toString();
  return `*From:* ${sender}  \n*Date:* ${date}  \n\n${value}`;
}
