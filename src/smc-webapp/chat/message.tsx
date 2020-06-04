/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// standard non-CoCalc libraries
import { List, Map } from "immutable";
const { IS_TOUCH } = require("../feature");

// CoCalc libraries
import { Avatar } from "../account/avatar/avatar";
import { path_split, smiley } from "smc-util/misc";
import {
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
  INPUT_HEIGHT,
} from "./utils";
import { Markdown } from "./markdown";

import { React, useMemo, useRef, useState } from "../app-framework";
import { Icon, Space, TimeAgo, Tip } from "../r_misc";
import { Button, Col, Grid, Row } from "../antd-bootstrap";

import { HistoryTitle, HistoryFooter, History } from "./history";
import { ChatInput } from "./input";
import { ChatActions } from "./actions";

import { Time } from "./time";
import { Name } from "./name";

const BLANK_COLUMN = <Col key={2} xs={2} sm={2}></Col>;

interface Props {
  actions?: ChatActions;

  get_user_name: (account_id: string) => string;
  message: Map<string, any>; // immutable.js message object
  history?: List<any>;
  account_id: string;
  date?: string;
  sender_name?: string;
  editor_name?: string;
  user_map?: Map<string, any>;
  project_id?: string; // improves relative links if given
  path?: string;
  font_size: number;
  show_avatar?: boolean;
  is_prev_sender?: boolean;
  is_next_sender?: boolean;
  show_heads?: boolean;

  set_scroll?: Function;
  include_avatar_col?: boolean;
  scroll_into_view: () => void; // call to scroll this message into view
}

export const Message: React.FC<Props> = (props) => {
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

  const history_size = useMemo(() => props.message.get("history").size, [
    props.message,
  ]);

  const isEditing = useMemo(() => is_editing(props.message, props.account_id), [
    props.message,
    props.account_id,
  ]);

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
        text = `${props.editor_name} has updated this message. Esc to discard your changes and see theirs`;
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
        text = `Deleted by ${props.editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${props.editor_name}`;
    }

    if (
      !is_editing &&
      other_editors.size === 0 &&
      newest_content(props.message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${props.editor_name}`;
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
          <Button
            onClick={on_send}
            bsStyle="success"
            style={{ marginLeft: "10px" }}
            className="small"
          >
            Save
          </Button>
        ) : undefined}
      </span>
    );
  }

  function edit_message() {
    if (props.project_id == null || props.path == null || props.actions==null) {
      // no editing functionality of not in a project with a path.
      return;
    }
    props.scroll_into_view();
    props.actions.set_editing(props.message, true);
  }

  // All the columns
  function avatar_column() {
    let margin_top, marginLeft, marginRight, textAlign;

    let account = props.user_map
      ?.get(props.message.get("sender_id"))
      ?.to_JS?.();

    if (props.is_prev_sender) {
      margin_top = "5px";
    } else {
      margin_top = "15px";
    }

    if (sender_is_viewer(props.account_id, props.message)) {
      textAlign = "left";
      marginRight = "11px";
    } else {
      textAlign = "right";
      marginLeft = "11px";
    }

    const style = {
      display: "inline-block",
      marginTop: margin_top,
      marginLeft,
      marginRight,
      padding: "0px",
      textAlign,
      verticalAlign: "middle",
      width: "4%",
    };

    // TODO: do something better when we don't know the user
    // (or when sender account_id is bogus)
    return (
      <Col key={0} sm={1} style={style}>
        <div>
          {account != null && props.show_avatar ? (
            <Avatar size={32} account_id={account.account_id} />
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

    // smileys, just for fun.
    value = smiley({
      s: value,
      wrap: ['<span class="smc-editor-chat-smiley">', "</span>"],
    });

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
      <Col key={1} xs={10} sm={9}>
        {!props.is_prev_sender && !is_viewers_message && props.sender_name ? (
          <Name sender_name={props.sender_name} />
        ) : undefined}
        <div
          style={message_style}
          className="smc-chat-message"
          onDoubleClick={edit_message}
        >
          <span style={lighten}>
            <Time message={props.message} edit={edit_message.bind(this)} />
          </span>
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
            <History history={props.history} user_map={props.user_map} />
            <HistoryFooter />
          </div>
        )}
      </Col>
    );
  }

  function on_send(): void {
    if (props.actions == null) return;
    const mesg = edited_message_ref.current;
    if (mesg !== newest_content(props.message)) {
      props.actions.send_edit(props.message, mesg);
    } else {
      props.actions.set_editing(props.message, false);
    }
  }

  function on_clear(): void {
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
        project_id={props.project_id}
        path={props.path}
        input={edited_message}
        enable_mentions={true /* TODO */}
        on_clear={on_clear}
        on_send={on_send}
        height={INPUT_HEIGHT}
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
  return (
    <Grid>
      <Row>{cols}</Row>
    </Grid>
  );
};
