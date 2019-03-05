//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// standard non-CoCalc libraries
import * as immutable from "immutable";
const { IS_MOBILE, IS_TOUCH, isMobile } = require("./feature");
import { debounce } from "underscore";

// CoCalc libraries
const { Avatar } = require("./other-users");
const misc = require("smc-util/misc");
const misc_page = require("./misc_page");

import { SaveButton } from "./frame-editors/frame-tree/save-button";

import { MentionsInput, Mention } from "react-mentions";

// React libraries
import { React, ReactDOM, Component, rclass, rtypes } from "./app-framework";
const { Icon, Loading, SearchInput, TimeAgo, Tip } = require("./r_misc");
import {
  Alert,
  Button,
  Col,
  Grid,
  FormGroup,
  FormControl,
  Row,
  ButtonGroup,
  Well
} from "react-bootstrap";

const editor_chat = require("./editor_chat");

const {
  newest_content,
  sender_is_viewer,
  show_user_name,
  is_editing,
  blank_column,
  render_markdown,
  render_history_title,
  render_history_footer,
  render_history,
  send_chat,
  is_at_bottom,
  scroll_to_bottom,
  scroll_to_position
} = require("./editor_chat");

const { VideoChatButton } = require("./video-chat");
const { SMC_Dropwrapper } = require("./smc-dropzone");

const {webapp_client} = require('./webapp_client')

interface MessageProps {
  actions?: any;

  focus_end?(e: any): void; // TODO: type
  get_user_name: Function; // // TODO: this was optional but no existence checks

  message: immutable.Map<any, any>; // immutable.js message object
  history?: immutable.List<any>;
  account_id: string;
  date?: string;
  sender_name?: string;
  editor_name?: string;
  user_map: immutable.Map<any, any>; // TODO: this was optional but no existence checks
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
    saved_mesg: rtypes.string
  };
  constructor(props: MessageProps, context: any) {
    super(props, context);
    this.state = {
      edited_message: newest_content(this.props.message),
      history_size: this.props.message.get("history").size,
      show_history: false,
      new_changes: false
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      misc.is_different(this.props, nextProps, [
        "message",
        "user_map",
        "account_id",
        "show_avatar",
        "is_prev_sender",
        "is_next_sender",
        "editor_name",
        "saved_mesg",
        "sender_name"
      ]) ||
      misc.is_different(this.state, nextState, [
        "edited_message",
        "show_history",
        "new_changes"
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
        text = `${
          this.props.editor_name
        } has updated this message. Esc to discard your changes and see theirs`;
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
                  ? this.props.message
                      .get("history")
                      .first()
                      .get("date")
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
        ) : (
          undefined
        )}
      </span>
    );
  }

  edit_message = () => {
    this.props.actions.set_editing(this.props.message, true);
  };

  on_keydown = e => {
    if (e.keyCode === 27) {
      // ESC
      e.preventDefault();
      this.setState({
        edited_message: newest_content(this.props.message)
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
      width: "4%"
    };

    // TODO: do something better when we don't know the user (or when sender account_id is bogus)
    return (
      <Col key={0} xsHidden={true} sm={1} style={style}>
        <div>
          {account != null && this.props.show_avatar ? (
            <Avatar size={32} account_id={account.account_id} />
          ) : (
            undefined
          )}
        </div>
      </Col>
    );
  }

  content_column() {
    let borderRadius, marginBottom, marginTop: any;
    let value = newest_content(this.props.message);

    const {
      background,
      color,
      lighten,
      message_class
    } = editor_chat.message_colors(this.props.account_id, this.props.message);

    // smileys, just for fun.
    value = misc.smiley({
      s: value,
      wrap: ['<span class="smc-editor-chat-smiley">', "</span>"]
    });

    const font_size = `${this.props.font_size}px`;

    if (this.props.show_avatar) {
      marginBottom = "1vh";
    } else {
      marginBottom = "3px";
    }

    if (
      !this.props.is_prev_sender &&
      sender_is_viewer(this.props.account_id, this.props.message)
    ) {
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
      fontSize: font_size
    };

    return (
      <Col key={1} xs={10} sm={9}>
        {!this.props.is_prev_sender &&
        !sender_is_viewer(this.props.account_id, this.props.message)
          ? show_user_name(this.props.sender_name)
          : undefined}
        <Well
          style={message_style}
          className="smc-chat-message"
          bsSize="small"
          onDoubleClick={this.edit_message}
        >
          <span style={lighten}>
            {editor_chat.render_timeago(this.props.message, this.edit_message)}
          </span>
          {!is_editing(this.props.message, this.props.account_id)
            ? render_markdown(
                value,
                this.props.project_id,
                this.props.file_path,
                message_class
              )
            : undefined}
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
        </Well>
        {this.state.show_history ? render_history_title() : undefined}
        {this.state.show_history
          ? render_history(this.props.history, this.props.user_map)
          : undefined}
        {this.state.show_history ? render_history_footer() : undefined}
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
      cols = [this.avatar_column(), this.content_column(), blank_column()];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
    } else {
      cols = [this.content_column(), blank_column()];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
    }
    return <Row>{cols}</Row>;
  }
}

const SCROLL_DEBOUNCE_MS = 750;

interface ChatLogProps {
  messages: any; // immutable js map {timestamps} --> message.
  user_map?: any; // immutable js map {collaborators} --> account info
  account_id: string;
  project_id?: string; // optional -- used to render links more effectively
  file_path?: string; // optional -- ...
  font_size?: number;
  actions?: any;
  show_heads?: boolean;
  focus_end?(e: any): void;
  saved_mesg?: string;
  set_scroll?: Function;
  search?: string;
}

export class ChatLog extends Component<ChatLogProps> {
  public static propTypes = {
    messages: rtypes.object.isRequired, // immutable js map {timestamps} --> message.
    user_map: rtypes.object, // immutable js map {collaborators} --> account info
    account_id: rtypes.string,
    project_id: rtypes.string, // optional -- used to render links more effectively
    file_path: rtypes.string, // optional -- ...
    font_size: rtypes.number,
    actions: rtypes.object,
    show_heads: rtypes.bool,
    focus_end: rtypes.func,
    saved_mesg: rtypes.string,
    set_scroll: rtypes.func,
    search: rtypes.string
  };

  shouldComponentUpdate(nextProps) {
    return (
      this.props.messages !== nextProps.messages ||
      this.props.search !== nextProps.search ||
      this.props.user_map !== nextProps.user_map ||
      this.props.account_id !== nextProps.account_id ||
      this.props.saved_mesg !== nextProps.saved_mesg
    );
  }

  get_user_name = account_id => {
    let account_name;
    const account =
      this.props.user_map != null
        ? this.props.user_map.get(account_id)
        : undefined;
    if (account != null) {
      account_name = account.get("first_name") + " " + account.get("last_name");
    } else {
      account_name = "Unknown";
    }
    return account_name;
  };

  render_list_messages() {
    let search_terms;
    const is_next_message_sender = function(
      index: number,
      dates: any,
      messages: any
    ) {
      if (index + 1 === dates.length) {
        return false;
      }
      const current_message = messages.get(dates[index]);
      const next_message = messages.get(dates[index + 1]);
      return current_message.get("sender_id") === next_message.get("sender_id");
    };

    const is_prev_message_sender = function(
      index: number,
      dates: any,
      messages: any
    ) {
      if (index === 0) {
        return false;
      }
      const current_message = messages.get(dates[index]);
      const prev_message = messages.get(dates[index - 1]);
      return current_message.get("sender_id") === prev_message.get("sender_id");
    };

    const sorted_dates = this.props.messages
      .keySeq()
      .sort()
      .toJS();
    const v: any[] = [];
    if (this.props.search) {
      search_terms = misc.search_split(this.props.search.toLowerCase());
    } else {
      search_terms = undefined;
    }

    let not_showing = 0;
    for (let i = 0; i < sorted_dates.length; i++) {
      const date = sorted_dates[i];
      const message = this.props.messages.get(date);
      const first =
        message != null ? message.get("history").first() : undefined;
      const last_editor_name = this.get_user_name(
        first != null ? first.get("author_id") : undefined
      );
      const sender_name = this.get_user_name(
        message != null ? message.get("sender_id") : undefined
      );
      if (search_terms != null) {
        let content =
          (first != null ? first.get("content") : undefined) +
          " " +
          last_editor_name +
          " " +
          sender_name;
        content = content.toLowerCase();
        if (!misc.search_match(content, search_terms)) {
          not_showing += 1;
          continue;
        }
      }

      v.push(
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
          sender_name={sender_name}
          editor_name={last_editor_name}
          actions={this.props.actions}
          focus_end={this.props.focus_end}
          saved_mesg={
            message.getIn(["editing", this.props.account_id])
              ? this.props.saved_mesg
              : undefined
          }
          set_scroll={this.props.set_scroll}
        />
      );
    }

    if (not_showing) {
      const s = (
        <Alert bsStyle="warning" key="not_showing">
          Hiding {not_showing} chats that do not match search for '
          {this.props.search}'.
        </Alert>
      );
      v.push(s);
    }

    return v;
  }

  render() {
    return <Grid fluid>{this.render_list_messages()}</Grid>;
  }
}

interface ChatRoomOwnProps {}

interface ChatRoomReduxProps {
  redux?: any;
  actions?: any;
  name: string;
  project_id: string;
  path?: string;
  height: number;
  input: string;
  is_preview: boolean;
  messages: any;
  offset: number;
  saved_mesg: string;
  saved_position: number;
  use_saved_position: boolean;
  search: string;
  user_map?: any;
  project_map: any;
  account_id: string;
  font_size?: number;
  file_use?: any;
  is_saving: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
}

type ChatRoomProps = ChatRoomOwnProps & ChatRoomReduxProps;

interface ChatRoomState {
  preview: string;
}

class ChatRoom0 extends Component<ChatRoomProps, ChatRoomState> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        height: rtypes.number,
        input: rtypes.string,
        is_preview: rtypes.bool,
        messages: rtypes.immutable,
        offset: rtypes.number,
        saved_mesg: rtypes.string,
        saved_position: rtypes.number,
        use_saved_position: rtypes.bool,
        search: rtypes.string,
        is_saving: rtypes.bool,
        has_unsaved_changes: rtypes.bool,
        has_uncommitted_changes: rtypes.bool
      },

      users: {
        user_map: rtypes.immutable
      },

      projects: {
        project_map: rtypes.immutable
      },

      account: {
        account_id: rtypes.string,
        font_size: rtypes.number
      },

      file_use: {
        file_use: rtypes.immutable
      }
    };
  }

  public static propTypes = {
    redux: rtypes.object,
    actions: rtypes.object,
    name: rtypes.string.isRequired,
    project_id: rtypes.string.isRequired,
    path: rtypes.string
  };

  constructor(props: ChatRoomProps, context: any) {
    super(props, context);
    this.state = { preview: "" };
  }

  private static preview_style: React.CSSProperties = {
    background: "#f5f5f5",
    fontSize: "14px",
    borderRadius: "10px 10px 10px 10px",
    boxShadow: "#666 3px 3px 3px",
    paddingBottom: "20px"
  };

  private _is_mounted: boolean;

  fix_scroll_position_after_mount = () => {
    // Optionally set the scroll position back after waiting a moment
    // for image sizes to load.
    const fix_pos = () => {
      if (!this._is_mounted) {
        return;
      }
      scroll_to_position(
        this.refs.log_container,
        this.props.saved_position,
        this.props.offset,
        this.props.height,
        this.props.use_saved_position,
        this.props.actions
      );
    };
    // We adjust the scroll position multiple times due to dynamic content (e.g., images)
    // changing the vertical height as the chat history is rendered.  This can fail
    // if the dynamic change takes a while, but the failure is a slight scroll position
    // issue -- if the user is switching tabs back and forth in a session, that is very
    // unlikely, due to the browser caching the dynamic content.
    // The user is also unlikely to manually scroll the page then see it jump to
    // this fixed position within 500ms of mounting.
    return [0, 200, SCROLL_DEBOUNCE_MS - 250].map(tm =>
      setTimeout(fix_pos, tm)
    );
  };

  componentDidMount() {
    this._is_mounted = true;
    this.fix_scroll_position_after_mount();
    if (this.props.is_preview) {
      if (
        is_at_bottom(
          this.props.saved_position,
          this.props.offset,
          this.props.height
        )
      ) {
        this.debounce_bottom();
      }
    } else {
      this.props.actions.set_is_preview(false);
    }
  }

  componentWillReceiveProps(next) {
    if (
      (this.props.messages !== next.messages ||
        this.props.input !== next.input) &&
      is_at_bottom(
        this.props.saved_position,
        this.props.offset,
        this.props.height
      )
    ) {
      this.props.actions.set_use_saved_position(false);
    }
  }

  componentDidUpdate() {
    if (!this.props.use_saved_position) {
      scroll_to_bottom(this.refs.log_container, this.props.actions);
    }
  }

  mark_as_read = debounce(() => {
    const info = this.props.redux
      .getStore("file_use")
      .get_file_info(this.props.project_id, this.props.path);
    if (info == null || info.is_unread) {
      // file is unread from *our* point of view, so mark read
      return this.props.redux
        .getActions("file_use")
        .mark_file(this.props.project_id, this.props.path, "read", 2000);
    }
  }, 300);

  keydown = (e: any) => {
    // TODO: Add timeout component to is_typing
    if (e.keyCode === 13 && e.shiftKey) {
      // 13: enter key
      return send_chat(
        e,
        this.refs.log_container,
        this.props.input,
        this.props.actions
      );
    } else if (
      e.keyCode === 38 &&
      ReactDOM.findDOMNode(this.refs.input).value === ""
    ) {
      // Up arrow on an empty input
      this.props.actions.set_to_last_input();
    }
  };

  componentWillUnmount() {
    this._is_mounted = false;
    this.save_scroll_position();
  }

  save_scroll_position = () => {
    this.props.actions.set_use_saved_position(true);
    const node = ReactDOM.findDOMNode(this.refs.log_container);
    if (node != null) {
      this.props.actions.save_scroll_state(
        node.scrollTop,
        node.scrollHeight,
        node.offsetHeight
      );
    }
  };

  button_send_chat = e => {
    send_chat(
      e,
      this.refs.log_container,
      ReactDOM.findDOMNode(this.refs.input).value,
      this.props.actions
    );
    ReactDOM.findDOMNode(this.refs.input).focus();
  };

  button_scroll_to_bottom = () => {
    scroll_to_bottom(this.refs.log_container, this.props.actions);
  };

  button_off_click = () => {
    this.props.actions.set_is_preview(false);
    ReactDOM.findDOMNode(this.refs.input).focus();
  };

  button_on_click = () => {
    this.props.actions.set_is_preview(true);
    ReactDOM.findDOMNode(this.refs.input).focus();
    if (
      is_at_bottom(
        this.props.saved_position,
        this.props.offset,
        this.props.height
      )
    ) {
      scroll_to_bottom(this.refs.log_container, this.props.actions);
    }
  };

  set_chat_log_state = debounce(() => {
    if (this.refs.log_container != null) {
      const node = ReactDOM.findDOMNode(this.refs.log_container);
      this.props.actions.save_scroll_state(
        node.scrollTop,
        node.scrollHeight,
        node.offsetHeight
      );
    }
  }, 300);

  set_preview_state = debounce(
    () => {
      if (this.refs.log_container != null) {
        this.setState({ preview: this.props.input });
      }
      if (this.refs.preview) {
        // const node = ReactDOM.findDOMNode(this.refs.preview); // TODO: is this used?
        // return (this._preview_height = node.offsetHeight - 12); // TODO: is this used?
      }
    }, // sets it to 75px starting then scales with height.
    300
  );

  debounce_bottom = debounce(() => {
    //debounces it so that the preview shows up then calls
    scroll_to_bottom(this.refs.log_container, this.props.actions);
  }, 300);

  show_files = () => {
    this.props.redux != null
      ? this.props.redux
          .getProjectActions(this.props.project_id)
          .load_target("files")
      : undefined;
  };

  show_timetravel = () => {
    this.props.redux != null
      ? this.props.redux.getProjectActions(this.props.project_id).open_file({
          path: misc.history_path(this.props.path),
          foreground: true,
          foreground_project: true
        })
      : undefined;
  };

  // All render methods
  render_bottom_tip() {
    const tip = (
      <span>
        You may enter (Github flavored) markdown here and include Latex
        mathematics in $ signs. In particular, use # for headings, > for block
        quotes, *'s for italic text, **'s for bold text, - at the beginning of a
        line for lists, back ticks ` for code, and URL's will automatically
        become links. Press shift+enter to send your chat. Double click to edit
        past chats.
      </span>
    );

    return (
      <Tip title="Use Markdown" tip={tip}>
        <div
          style={{ color: "#767676", fontSize: "12.5px", marginBottom: "5px" }}
        >
          Shift+Enter to send your message. Double click chat bubbles to edit
          them. Format using{" "}
          <a
            href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/"
            target="_blank"
          >
            Markdown
          </a>{" "}
          and{" "}
          <a
            href="https://en.wikibooks.org/wiki/LaTeX/Mathematics"
            target="_blank"
          >
            LaTeX
          </a>
          . Emoticons: {misc.emoticons}.
        </div>
      </Tip>
    );
  }

  render_preview_message() {
    this.set_preview_state();
    if (this.state.preview.length > 0) {
      let value = this.state.preview;
      value = misc.smiley({
        s: value,
        wrap: ['<span class="smc-editor-chat-smiley">', "</span>"]
      });
      value = misc_page.sanitize_html_safe(value);
      const file_path =
        this.props.path != null
          ? misc.path_split(this.props.path).head
          : undefined;

      return (
        <Row
          ref="preview"
          style={{ position: "absolute", bottom: "0px", width: "100%" }}
        >
          <Col xs={0} sm={2} />

          <Col xs={10} sm={9}>
            <Well bsSize="small" style={ChatRoom0.preview_style}>
              <div
                className="pull-right lighten"
                style={{
                  marginRight: "-8px",
                  marginTop: "-10px",
                  cursor: "pointer",
                  fontSize: "13pt"
                }}
                onClick={this.button_off_click}
              >
                <Icon name="times" />
              </div>
              {render_markdown(value, this.props.project_id, file_path)}
              <span className="pull-right small lighten">
                Preview (press Shift+Enter to send)
              </span>
            </Well>
          </Col>

          <Col sm={1} />
        </Row>
      );
    }
  }

  render_timetravel_button() {
    const tip = <span>Browse all versions of this chatroom.</span>;

    return (
      <Button onClick={this.show_timetravel} bsStyle="info">
        <Tip title="TimeTravel" tip={tip} placement="left">
          <Icon name="history" /> TimeTravel
        </Tip>
      </Button>
    );
  }

  render_bottom_button() {
    const tip = <span>Scrolls the chat to the bottom</span>;

    return (
      <Button onClick={this.button_scroll_to_bottom}>
        <Tip title="Scroll to Bottom" tip={tip} placement="left">
          <Icon name="arrow-down" /> Bottom
        </Tip>
      </Button>
    );
  }

  render_save_button() {
    return (
      <SaveButton
        onClick={() => this.props.actions.save_to_disk()}
        is_saving={this.props.is_saving}
        has_unsaved_changes={this.props.has_unsaved_changes}
        has_uncommitted_changes={this.props.has_uncommitted_changes}
      />
    );
  }

  render_video_chat_button() {
    return (
      <VideoChatButton
        project_id={this.props.project_id}
        path={this.props.path}
        label={"Video Chat"}
      />
    );
  }

  render_search() {
    return (
      <SearchInput
        placeholder={"Find messages..."}
        default_value={this.props.search}
        on_change={debounce(
          value => this.props.actions.setState({ search: value }),
          500
        )}
        style={{ margin: 0 }}
      />
    );
  }

  render_button_row() {
    return (
      <Row style={{ marginTop: "5px" }}>
        <Col xs={6} md={6} style={{ padding: "2px" }}>
          {this.render_search()}
        </Col>
        <Col
          xs={6}
          md={6}
          className="pull-right"
          style={{ padding: "2px", textAlign: "right" }}
        >
          <ButtonGroup>
            {this.render_save_button()}
            {this.render_timetravel_button()}
            {this.render_video_chat_button()}
            {this.render_bottom_button()}
          </ButtonGroup>
        </Col>
      </Row>
    );
  }

  generate_temp_upload_text = file => {
    return `[Uploading...]\(${file.name}\)`;
  };

  start_upload = file => {
    const text_area = ReactDOM.findDOMNode(this.refs.input);
    const temporary_insertion_text = this.generate_temp_upload_text(file);
    const temp_new_text =
      this.props.input.slice(0, text_area.selectionStart) +
      temporary_insertion_text +
      this.props.input.slice(text_area.selectionEnd);
    return this.props.actions.set_input(temp_new_text);
  };

  append_file = file => {
    let final_insertion_text;
    if (file.type.indexOf("image") !== -1) {
      final_insertion_text = `<img src=\".chat-images/${
        file.name
      }\" width='100%'>`;
    } else {
      final_insertion_text = `[${file.name}](${file.name})`;
    }

    const temporary_insertion_text = this.generate_temp_upload_text(file);
    const start_index = this.props.input.indexOf(temporary_insertion_text);
    const end_index = start_index + temporary_insertion_text.length;

    if (start_index === -1) {
      return;
    }

    const new_text =
      this.props.input.slice(0, start_index) +
      final_insertion_text +
      this.props.input.slice(end_index);
    return this.props.actions.set_input(new_text);
  };

  private dropzoneWrapperRef: any;

  handle_paste_event = (e: React.ClipboardEvent<FormControl>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item != null && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file != null) {
          const blob = file.slice(0, -1, item.type);
          this.dropzoneWrapperRef.dropzone.addFile(
            // TODO: pasted things always have the same name,
            // which can cause some overwriting of files.
            // The best thing to do would be to hash the contents.
            new File([blob], `paste-${Math.random()}`, { type: item.type })
          );
        }
        return;
      }
    }
  };

  on_mention = (id) => {
    webapp_client.mention({
      project_id: this.props.project_id,
      path: this.props.path,
      target: id,
      cb: console.log,
      priority: 2
    });
  };

  render_body() {
    const chat_log_style: React.CSSProperties = {
      overflowY: "auto",
      overflowX: "hidden",
      margin: "0",
      padding: "0",
      paddingRight: "10px",
      background: "white",
      flex: 1
    };

    const chat_input_style: React.CSSProperties = {
      margin: "0",
      height: "90px",
      fontSize: this.props.font_size
    };

    const user_array = this.props.project_map
      .getIn([this.props.project_id, "users"])
      .keySeq()
      .map(account_id => {
        return {
          id: account_id,
          display: this.props.redux.getStore("users").get_name(account_id)
        };
      })
      .toJS();

    return (
      <Grid
        fluid={true}
        className="smc-vfill"
        style={{ maxWidth: "1200px", display: "flex", flexDirection: "column" }}
      >
        {!IS_MOBILE ? this.render_button_row() : undefined}
        <Row className="smc-vfill">
          <Col
            className="smc-vfill"
            md={12}
            style={{ padding: "0px 2px 0px 2px" }}
          >
            <Well
              style={chat_log_style}
              ref="log_container"
              onScroll={debounce(this.save_scroll_position, SCROLL_DEBOUNCE_MS)}
            >
              <ChatLog
                messages={this.props.messages}
                account_id={this.props.account_id}
                user_map={this.props.user_map}
                project_id={this.props.project_id}
                font_size={this.props.font_size}
                file_path={
                  this.props.path != null
                    ? misc.path_split(this.props.path).head
                    : undefined
                }
                actions={this.props.actions}
                saved_mesg={this.props.saved_mesg}
                search={this.props.search}
                set_scroll={this.set_chat_log_state}
                show_heads={true}
              />
              {this.props.input.length > 0 && this.props.is_preview
                ? this.render_preview_message()
                : undefined}
            </Well>
          </Col>
        </Row>
        <Row style={{ display: "flex" }}>
          <Col style={{ flex: "1", padding: "0px 2px 0px 2px" }}>
            <SMC_Dropwrapper
              ref={node => (this.dropzoneWrapperRef = node)}
              project_id={this.props.project_id}
              dest_path={misc.normalized_path_join(
                this.props.redux
                  .getProjectStore(this.props.project_id)
                  .get("current_path"),
                "/.chat-images"
              )}
              event_handlers={{
                complete: this.append_file,
                sending: this.start_upload
              }}
            >
              <MentionsInput
                autoFocus={!IS_MOBILE || isMobile.Android()}
                displayTransform={(_, display) => "@" + display}
                style={chat_input_style}
                markup='<span class="user-mention">@__display__</span>'
                ref="input"
                onKeyDown={this.keydown}
                value={this.props.input}
                placeholder={"Mention people using '@'"}
                onPaste={this.handle_paste_event}
                onChange={(e: any) => {
                  this.props.actions.set_input(e.target.value);
                  this.mark_as_read();
                }}
              >
                <Mention
                  trigger="@"
                  data={user_array}
                  onAdd={this.on_mention}
                  appendSpaceOnAdd={true}
                />
              </MentionsInput>
            </SMC_Dropwrapper>
          </Col>
          <Col
            style={{
              height: "90px",
              padding: "0",
              marginBottom: "0",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {!IS_MOBILE ? (
              <Button
                onClick={this.button_on_click}
                disabled={this.props.input === ""}
                bsStyle="info"
                style={{ height: "50%", width: "100%" }}
              >
                Preview
              </Button>
            ) : (
              undefined
            )}
            <Button
              onClick={this.button_send_chat}
              disabled={this.props.input === ""}
              bsStyle="success"
              style={{ flex: 1, width: "100%" }}
            >
              Send
            </Button>
          </Col>
        </Row>
        <Row>{!IS_MOBILE ? this.render_bottom_tip() : undefined}</Row>
      </Grid>
    );
  }

  render() {
    if (
      this.props.messages == null ||
      this.props.redux == null ||
      (this.props.input != null ? this.props.input.length : undefined) == null
    ) {
      return <Loading />;
    }
    return (
      <div
        onMouseMove={this.mark_as_read}
        onClick={this.mark_as_read}
        className="smc-vfill"
      >
        {this.render_body()}
      </div>
    );
  }
}

export const ChatRoom = rclass<ChatRoomOwnProps>(ChatRoom0);
