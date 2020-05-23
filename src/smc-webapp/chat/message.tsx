/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// standard non-CoCalc libraries
import * as immutable from "immutable";
const { IS_MOBILE, IS_TOUCH } = require("../feature");

// CoCalc libraries
import { Avatar } from "../account/avatar/avatar";
import { is_different, smiley } from "smc-util/misc";

// have to rewrite buttons like SaveButton in antd before we can
// switch to antd buttons.
import { Button } from "react-bootstrap";

import {
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
} from "./utils";
import { Markdown } from "./markdown";

import { React, ReactDOM, Component, rtypes } from "../app-framework";
import { Icon, TimeAgo, Tip } from "../r_misc";
import { Col, FormGroup, FormControl, Grid, Row } from "../antd-bootstrap";

import { HistoryTitle, HistoryFooter, History } from "./history";

import { Time } from "./time";
import { Name } from "./name";

const BLANK_COLUMN = <Col key={2} xs={2} sm={2}></Col>;

interface MessageProps {
  actions?: any;

  focus_end?(e: any): void; // TODO: type
  get_user_name: Function; // // TODO: this was optional but no existence checks

  message: immutable.Map<string, any>; // immutable.js message object
  history?: immutable.List<any>;
  account_id: string;
  date?: string;
  sender_name?: string;
  editor_name?: string;
  user_map?: immutable.Map<string, any>;
  project_id?: string; // optional -- improves relative links if given
  file_path?: string; // optional -- (used by renderer; path containing the chat log)
  font_size?: number;
  show_avatar?: boolean;
  is_prev_sender?: boolean;
  is_next_sender?: boolean;
  show_heads?: boolean;
  saved_mesg?: string;

  set_scroll?: Function;
  include_avatar_col?: boolean;
}

interface MessageState {
  edited_message: any;
  history_size: number;
  show_history: boolean;
  new_changes: boolean;
}

export class Message extends Component<MessageProps, MessageState> {
  public static propTypes = {
    actions: rtypes.object,

    focus_end: rtypes.func,
    get_user_name: rtypes.func,

    message: rtypes.immutable.Map.isRequired, // immutable.js message object
    history: rtypes.immutable.List,
    account_id: rtypes.string.isRequired,
    date: rtypes.string,
    sender_name: rtypes.string,
    editor_name: rtypes.string,
    user_map: rtypes.immutable.Map,
    project_id: rtypes.string, // optional -- improves relative links if given
    file_path: rtypes.string, // optional -- (used by renderer; path containing the chat log)
    font_size: rtypes.number,
    show_avatar: rtypes.bool,
    is_prev_sender: rtypes.bool,
    is_next_sender: rtypes.bool,
    show_heads: rtypes.bool,
    saved_mesg: rtypes.string,
  };
  constructor(props: MessageProps, context: any) {
    super(props, context);
    this.state = {
      edited_message: newest_content(this.props.message),
      history_size: this.props.message.get("history").size,
      show_history: false,
      new_changes: false,
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      is_different(this.props, nextProps, [
        "message",
        "user_map",
        "account_id",
        "show_avatar",
        "is_prev_sender",
        "is_next_sender",
        "editor_name",
        "saved_mesg",
        "sender_name",
      ]) ||
      is_different(this.state, nextState, [
        "edited_message",
        "show_history",
        "new_changes",
      ])
    );
  }

  componentWillReceiveProps(newProps) {
    if (this.state.history_size !== this.props.message.get("history").size) {
      this.setState({ history_size: this.props.message.get("history").size });
    }
    let changes = false;
    if (this.state.edited_message === newest_content(this.props.message)) {
      let edited_message = "";
      const history = newProps.message.get("history");
      if (history != null && history.first() != null) {
        edited_message = history.first().get("content") || "";
      }
      this.setState({ edited_message });
    } else {
      changes = true;
    }
    this.setState({ new_changes: changes });
  }

  componentDidMount() {
    if (this.refs.editedMessage) {
      this.setState({ edited_message: this.props.saved_mesg });
    }
  }

  componentDidUpdate() {
    if (this.refs.editedMessage) {
      this.props.actions.saved_message(
        ReactDOM.findDOMNode(this.refs.editedMessage).value
      );
    }
  }

  toggle_history() {
    // No history for mobile, since right now messages in mobile are too clunky
    if (!IS_MOBILE) {
      if (!this.state.show_history) {
        return (
          <span
            className="small"
            style={{ marginLeft: "10px", cursor: "pointer" }}
            onClick={() => this.toggle_history_chat(true)}
          >
            <Tip
              title="Message History"
              tip="Show history of editing of this message."
            >
              <Icon name="history" /> Edited
            </Tip>
          </span>
        );
      } else {
        return (
          <span
            className="small"
            style={{ marginLeft: "10px", cursor: "pointer" }}
            onClick={() => this.toggle_history_chat(false)}
          >
            <Tip
              title="Message History"
              tip="Hide history of editing of this message."
            >
              <Icon name="history" /> Hide History
            </Tip>
          </span>
        );
      }
    }
  }

  toggle_history_chat = (bool: boolean) => {
    this.setState({ show_history: bool });
    this.props.set_scroll != null && this.props.set_scroll();
  };

  editing_status() {
    let text;
    const other_editors = this.props.message
      .get("editing")
      .remove(this.props.account_id)
      .keySeq();
    // TODO: is this used?
    //const current_user =
    //  this.props.user_map.get(this.props.account_id).get("first_name") +
    //  " " +
    //  this.props.user_map.get(this.props.account_id).get("last_name");
    if (is_editing(this.props.message, this.props.account_id)) {
      // let color; // TODO: is this used?
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = `${this.props.get_user_name(
          other_editors.first()
        )} is also editing this!`;
        // color = "#E55435";
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
        // color = "#E55435";
      } else if (
        this.state.history_size !== this.props.message.get("history").size &&
        this.state.new_changes
      ) {
        text = `${this.props.editor_name} has updated this message. Esc to discard your changes and see theirs`;
        // color = "#E55435";
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
        text = `${this.props.get_user_name(
          other_editors.first()
        )} is editing this message`;
      } else if (other_editors.size > 1) {
        // Multiple editors
        text = `${other_editors.size} people are editing this message`;
      } else if (newest_content(this.props.message).trim() === "") {
        text = `Deleted by ${this.props.editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${this.props.editor_name}`;
    }

    if (
      !is_editing(this.props.message, this.props.account_id) &&
      other_editors.size === 0 &&
      newest_content(this.props.message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${this.props.editor_name}`;
      return (
        <span className="small">
          {edit}
          <TimeAgo
            date={
              new Date(
                this.props.message.get("history").first() != null
                  ? this.props.message.get("history").first().get("date")
                  : undefined
              )
            }
          />
          {name}
        </span>
      );
    }
    return (
      <span className="small">
        {text}
        {is_editing(this.props.message, this.props.account_id) ? (
          <Button
            onClick={this.save_edit}
            bsStyle="success"
            style={{ marginLeft: "10px", marginTop: "-5px" }}
            className="small"
          >
            Save
          </Button>
        ) : undefined}
      </span>
    );
  }

  edit_message = () => {
    this.props.actions.set_editing(this.props.message, true);
  };

  on_keydown = (e) => {
    if (e.keyCode === 27) {
      // ESC
      e.preventDefault();
      this.setState({
        edited_message: newest_content(this.props.message),
      });
      this.props.actions.set_editing(this.props.message, false);
    } else if (e.keyCode === 13 && e.shiftKey) {
      // 13: enter key
      const mesg = ReactDOM.findDOMNode(this.refs.editedMessage).value;
      if (mesg !== newest_content(this.props.message)) {
        this.props.actions.send_edit(this.props.message, mesg);
      } else {
        this.props.actions.set_editing(this.props.message, false);
      }
    }
  };

  save_edit = () => {
    const mesg = ReactDOM.findDOMNode(this.refs.editedMessage).value;
    if (mesg !== newest_content(this.props.message)) {
      this.props.actions.send_edit(this.props.message, mesg);
    } else {
      this.props.actions.set_editing(this.props.message, false);
    }
  };

  // All the columns
  avatar_column() {
    let margin_top, marginLeft, marginRight, textAlign;

    let account =
      this.props.user_map != null
        ? this.props.user_map.get(this.props.message.get("sender_id"))
        : undefined;
    if (account != null) {
      account = account.toJS();
    }

    if (this.props.is_prev_sender) {
      margin_top = "5px";
    } else {
      margin_top = "15px";
    }

    if (sender_is_viewer(this.props.account_id, this.props.message)) {
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
          {account != null && this.props.show_avatar ? (
            <Avatar size={32} account_id={account.account_id} />
          ) : undefined}
        </div>
      </Col>
    );
  }

  content_column() {
    let borderRadius, marginBottom, marginTop: any;
    let value = newest_content(this.props.message);

    const is_viewers_message = sender_is_viewer(
      this.props.account_id,
      this.props.message
    );

    const { background, color, lighten, message_class } = message_colors(
      this.props.account_id,
      this.props.message
    );

    // smileys, just for fun.
    value = smiley({
      s: value,
      wrap: ['<span class="smc-editor-chat-smiley">', "</span>"],
    });

    const font_size = `${this.props.font_size}px`;

    if (this.props.show_avatar) {
      marginBottom = "1vh";
    } else {
      marginBottom = "3px";
    }

    if (!this.props.is_prev_sender && is_viewers_message) {
      marginTop = "17px";
    }

    if (
      !this.props.is_prev_sender &&
      !this.props.is_next_sender &&
      !this.state.show_history
    ) {
      borderRadius = "10px 10px 10px 10px";
    } else if (!this.props.is_prev_sender) {
      borderRadius = "10px 10px 5px 5px";
    } else if (!this.props.is_next_sender) {
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
        {!this.props.is_prev_sender &&
        !is_viewers_message &&
        this.props.sender_name ? (
          <Name sender_name={this.props.sender_name} />
        ) : undefined}
        <div
          style={message_style}
          className="smc-chat-message"
          onDoubleClick={this.edit_message}
        >
          <span style={lighten}>
            <Time
              message={this.props.message}
              edit={this.edit_message.bind(this)}
            />
          </span>
          {!is_editing(this.props.message, this.props.account_id) ? (
            <Markdown
              value={value}
              project_id={this.props.project_id}
              file_path={this.props.file_path}
              className={message_class}
            />
          ) : undefined}
          {is_editing(this.props.message, this.props.account_id)
            ? this.render_input()
            : undefined}
          <span style={lighten}>
            {this.props.message.get("history").size > 1 ||
            this.props.message.get("editing").size > 0
              ? this.editing_status()
              : undefined}
            {this.props.message.get("history").size > 1
              ? this.toggle_history()
              : undefined}
          </span>
        </div>
        {this.state.show_history && (
          <div>
            <HistoryTitle />
            <History
              history={this.props.history}
              user_map={this.props.user_map}
            />
            <HistoryFooter />
          </div>
        )}
      </Col>
    );
  }

  // All the render methods

  render_input() {
    return (
      <div>
        <FormGroup>
          <FormControl
            style={{ fontSize: this.props.font_size }}
            autoFocus={true}
            rows={4}
            componentClass="textarea"
            ref="editedMessage"
            onKeyDown={this.on_keydown}
            value={this.state.edited_message}
            onChange={(e: any) =>
              this.setState({ edited_message: e.target.value })
            }
            onFocus={this.props.focus_end}
          />
        </FormGroup>
      </div>
    );
  }

  render() {
    let cols;
    if (this.props.include_avatar_col) {
      cols = [this.avatar_column(), this.content_column(), BLANK_COLUMN];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
    } else {
      cols = [this.content_column(), BLANK_COLUMN];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
    }
    return (
      <Grid>
        <Row>{cols}</Row>
      </Grid>
    );
  }
}
