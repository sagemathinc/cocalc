/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2015 -- 2016, SageMath, Inc.
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
const immutable = require("immutable");
const { IS_MOBILE, IS_TOUCH } = require("./feature");
const underscore = require("underscore");

// CoCalc libraries
const misc = require("smc-util/misc");
const misc_page = require("./misc_page");
const { defaults, required } = misc;
const { webapp_client } = require("./webapp_client");

const { alert_message } = require("./alerts");

// React libraries
const {
  React,
  ReactDOM,
  rclass,
  rtypes,
  Actions,
  Store,
  Redux
} = require("./app-framework");
const { Icon, Loading, Markdown, TimeAgo, Tip } = require("./r_misc");
const {
  Button,
  Col,
  Grid,
  FormGroup,
  FormControl,
  ListGroup,
  ListGroupItem,
  Panel,
  Row,
  ButtonGroup,
  Well
} = require("react-bootstrap");

const { User } = require("./users");

const editor_chat = require("./editor_chat");

const {
  redux_name,
  init_redux,
  newest_content,
  sender_is_viewer,
  show_user_name,
  is_editing,
  blank_column,
  render_markdown,
  render_history_title,
  render_history_footer,
  render_history,
  get_user_name,
  send_chat,
  clear_input,
  is_at_bottom,
  scroll_to_bottom,
  scroll_to_position
} = require("./editor_chat");

const { ProjectUsers } = require("./projects/project-users");
const { AddCollaborators } = require("./collaborators/add-to-project");

const Message = rclass({
  displayName: "Message",

  propTypes: {
    message: rtypes.object.isRequired, // immutable.js message object
    history: rtypes.object,
    account_id: rtypes.string.isRequired,
    date: rtypes.string,
    sender_name: rtypes.string,
    editor_name: rtypes.string,
    user_map: rtypes.object,
    project_id: rtypes.string, // optional -- improves relative links if given
    file_path: rtypes.string, // optional -- (used by renderer; path containing the chat log)
    font_size: rtypes.number,
    show_avatar: rtypes.bool,
    get_user_name: rtypes.func,
    is_prev_sender: rtypes.bool,
    is_next_sender: rtypes.bool,
    actions: rtypes.object,
    show_heads: rtypes.bool,
    saved_mesg: rtypes.string,
    close_input: rtypes.func
  },

  getInitialState() {
    return {
      edited_message: newest_content(this.props.message),
      history_size: this.props.message.get("history").size,
      show_history: false,
      new_changes: false
    };
  },

  componentWillReceiveProps(newProps) {
    if (this.state.history_size !== this.props.message.get("history").size) {
      this.setState({ history_size: this.props.message.get("history").size });
    }
    let changes = false;
    if (this.state.edited_message === newest_content(this.props.message)) {
      let left;
      this.setState({
        edited_message:
          (left = __guard__(
            __guard__(newProps.message.get("history"), x1 => x1.first()),
            x => x.get("content")
          )) != null
            ? left
            : ""
      });
    } else {
      changes = true;
    }
    return this.setState({ new_changes: changes });
  },

  shouldComponentUpdate(next, next_state) {
    return (
      this.props.message !== next.message ||
      this.props.user_map !== next.user_map ||
      this.props.account_id !== next.account_id ||
      this.props.is_prev_sender !== next.is_prev_sender ||
      this.props.is_next_sender !== next.is_next_sender ||
      this.props.editor_name !== next.editor_name ||
      this.props.saved_mesg !== next.saved_mesg ||
      this.state.edited_message !== next_state.edited_message ||
      this.state.show_history !== next_state.show_history ||
      (!this.props.is_prev_sender &&
        this.props.sender_name !== next.sender_name)
    );
  },

  componentDidMount() {
    if (this.refs.editedMessage) {
      return this.setState({ edited_message: this.props.saved_mesg });
    }
  },

  componentDidUpdate() {
    if (this.refs.editedMessage) {
      return this.props.actions.saved_message(
        ReactDOM.findDOMNode(this.refs.editedMessage).value
      );
    }
  },

  toggle_history() {
    //No history for mobile, since right now messages in mobile are too clunky
    if (!IS_MOBILE) {
      if (!this.state.show_history) {
        return (
          <span
            className="small"
            style={{ marginLeft: "10px", cursor: "pointer" }}
            onClick={() => this.toggle_history_side_chat(true)}
          >
            <Tip
              title="Message History"
              tip="Show history of editing of this message."
              placement="left"
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
            onClick={() => this.toggle_history_side_chat(false)}
          >
            <Tip
              title="Message History"
              tip="Hide history of editing of this message."
              placement="left"
            >
              <Icon name="history" /> Hide History
            </Tip>
          </span>
        );
      }
    }
  },

  toggle_history_side_chat(bool) {
    return this.setState({ show_history: bool });
  },

  editing_status() {
    let text;
    const other_editors = this.props.message
      .get("editing")
      .remove(this.props.account_id)
      .keySeq();
    const current_user =
      this.props.user_map.get(this.props.account_id).get("first_name") +
      " " +
      this.props.user_map.get(this.props.account_id).get("last_name");
    if (is_editing(this.props.message, this.props.account_id)) {
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = `${this.props.get_user_name(
          other_editors.first(),
          this.props.user_map
        )} is also editing this!`;
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
      } else if (
        this.state.history_size !== this.props.message.get("history").size &&
        this.state.new_changes
      ) {
        text = `${
          this.props.editor_name
        } has updated this message. Esc to discard your changes and see theirs`;
      } else {
        text = "You are now editing ... Shift+Enter to submit changes.";
      }
    } else {
      if (other_editors.size === 1) {
        // One person is editing
        text = `${this.props.get_user_name(
          other_editors.first(),
          this.props.user_map
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
                __guard__(this.props.message.get("history").first(), x =>
                  x.get("date")
                )
              )
            }
          />
          {name}
        </span>
      );
    } else {
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
  },

  edit_message() {
    return this.props.actions.set_editing(this.props.message, true);
  },

  on_keydown(e) {
    if (e.keyCode === 27) {
      // ESC
      e.preventDefault();
      this.setState({
        edited_message: newest_content(this.props.message)
      });
      return this.props.actions.set_editing(this.props.message, false);
    } else if (e.keyCode === 13 && e.shiftKey) {
      // shift+enter
      return this.save_edit();
    }
  },

  save_edit() {
    const mesg = ReactDOM.findDOMNode(this.refs.editedMessage).value;
    if (mesg !== newest_content(this.props.message)) {
      return this.props.actions.send_edit(this.props.message, mesg);
    } else {
      return this.props.actions.set_editing(this.props.message, false);
    }
  },

  // All the columns
  content_column() {
    let borderRadius;
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

    if (
      !this.props.is_prev_sender &&
      sender_is_viewer(this.props.account_id, this.props.message)
    ) {
      const marginTop = "17px";
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

    const message_style = {
      background,
      wordBreak: "break-word",
      marginBottom: "3px",
      borderRadius,
      color
    };

    if (sender_is_viewer(this.props.account_id, this.props.message)) {
      message_style.marginLeft = "10%";
    } else {
      message_style.marginRight = "10%";
    }

    return (
      <Col key={1} xs={11} style={{ width: "100%" }}>
        {!this.props.is_prev_sender &&
        !sender_is_viewer(this.props.account_id, this.props.message)
          ? show_user_name(this.props.sender_name)
          : undefined}
        <Well
          style={message_style}
          bsSize="small"
          className="smc-chat-message"
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
  },

  render_input() {
    return (
      <form>
        <FormGroup>
          <FormControl
            autoFocus={true}
            rows={4}
            componentClass="textarea"
            ref="editedMessage"
            onKeyDown={this.on_keydown}
            value={this.state.edited_message}
            onChange={e => this.setState({ edited_message: e.target.value })}
          />
        </FormGroup>
      </form>
    );
  },

  render() {
    let cols;
    if (this.props.include_avatar_col) {
      cols = [this.avatar_column(), this.content_column(), blank_column()];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
      return <Row>{cols}</Row>;
    } else {
      cols = [this.content_column(), blank_column()];
      // mirror right-left for sender's view
      if (sender_is_viewer(this.props.account_id, this.props.message)) {
        cols = cols.reverse();
      }
      return <Row>{cols}</Row>;
    }
  }
});

const ChatLog = rclass({
  displayName: "ChatLog",

  propTypes: {
    messages: rtypes.object.isRequired, // immutable js map {timestamps} --> message.
    user_map: rtypes.object, // immutable js map {collaborators} --> account info
    account_id: rtypes.string,
    project_id: rtypes.string, // optional -- used to render links more effectively
    file_path: rtypes.string, // optional -- ...
    font_size: rtypes.number,
    actions: rtypes.object,
    show_heads: rtypes.bool,
    saved_mesg: rtypes.string,
    set_scroll: rtypes.func
  },

  shouldComponentUpdate(next) {
    return (
      this.props.messages !== next.messages ||
      this.props.user_map !== next.user_map ||
      this.props.account_id !== next.account_id ||
      this.props.saved_mesg !== next.saved_mesg
    );
  },

  close_edit_inputs(current_message_date, id, saved_message) {
    const sorted_dates = this.props.messages
      .keySeq()
      .sort(misc.cmp_Date)
      .toJS();
    return (() => {
      const result = [];
      for (let date of sorted_dates) {
        var left;
        const historyContent =
          (left = __guard__(
            this.props.messages
              .get(date)
              .get("history")
              .first(),
            x => x.get("content")
          )) != null
            ? left
            : "";
        if (
          date !== current_message_date &&
          __guard__(this.props.messages.get(date).get("editing"), x1 =>
            x1.has(id)
          )
        ) {
          if (historyContent !== saved_message) {
            result.push(
              this.props.actions.send_edit(
                this.props.messages.get(date),
                saved_message
              )
            );
          } else {
            result.push(
              this.props.actions.set_editing(
                this.props.messages.get(date),
                false
              )
            );
          }
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  },

  list_messages() {
    const is_next_message_sender = function(index, dates, messages) {
      if (index + 1 === dates.length) {
        return false;
      }
      const current_message = messages.get(dates[index]);
      const next_message = messages.get(dates[index + 1]);
      return current_message.get("sender_id") === next_message.get("sender_id");
    };

    const is_prev_message_sender = function(index, dates, messages) {
      if (index === 0) {
        return false;
      }
      const current_message = messages.get(dates[index]);
      const prev_message = messages.get(dates[index - 1]);
      return current_message.get("sender_id") === prev_message.get("sender_id");
    };

    const sorted_dates = this.props.messages
      .keySeq()
      .sort(misc.cmp_Date)
      .toJS();
    const v = [];
    for (let i = 0; i < sorted_dates.length; i++) {
      const date = sorted_dates[i];
      const sender_name = get_user_name(
        __guard__(this.props.messages.get(date), x => x.get("sender_id")),
        this.props.user_map
      );
      const last_editor_name = get_user_name(
        __guard__(
          __guard__(this.props.messages.get(date), x2 =>
            x2.get("history").first()
          ),
          x1 => x1.get("author_id")
        ),
        this.props.user_map
      );

      v.push(
        <Message
          key={date}
          account_id={this.props.account_id}
          history={this.props.messages.get(date).get("history")}
          user_map={this.props.user_map}
          message={this.props.messages.get(date)}
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
          get_user_name={get_user_name}
          sender_name={sender_name}
          editor_name={misc.trunc_middle(last_editor_name, 15)}
          actions={this.props.actions}
          saved_mesg={this.props.saved_mesg}
          close_input={this.close_edit_inputs}
          set_scroll={this.props.set_scroll}
        />
      );
    }

    return v;
  },

  render() {
    return (
      <Grid fluid style={{ marginTop: "15px" }}>
        {this.list_messages()}
      </Grid>
    );
  }
});

const log_container_style = {
  overflowY: "auto",
  flex: 1,
  backgroundColor: "#fafafa"
};

const ChatRoom = rclass(function({ name }) {
  return {
    displayName: "ChatRoom",

    reduxProps: {
      [name]: {
        messages: rtypes.immutable,
        input: rtypes.string,
        saved_position: rtypes.number,
        height: rtypes.number,
        offset: rtypes.number,
        saved_mesg: rtypes.string,
        use_saved_position: rtypes.bool,
        add_collab: rtypes.bool
      },
      users: {
        user_map: rtypes.immutable
      },
      account: {
        account_id: rtypes.string,
        font_size: rtypes.number
      },
      file_use: {
        file_use: rtypes.immutable
      },
      projects: {
        project_map: rtypes.immutable.Map
      }
    },

    propTypes: {
      redux: rtypes.object.isRequired,
      actions: rtypes.object.isRequired,
      name: rtypes.string.isRequired,
      project_id: rtypes.string.isRequired,
      file_use_id: rtypes.string.isRequired,
      path: rtypes.string
    },

    mark_as_read() {
      const info = this.props.redux
        .getStore("file_use")
        .get_file_info(
          this.props.project_id,
          misc.original_path(this.props.path)
        );
      if (info == null || info.is_unseenchat) {
        // only mark chat as read if it is unseen
        const f = this.props.redux.getActions("file_use").mark_file;
        f(this.props.project_id, this.props.path, "read");
        return f(this.props.project_id, this.props.path, "chatseen");
      }
    },

    on_keydown(e) {
      if (e.keyCode === 27) {
        // ESC
        return this.props.actions.set_input("");
      } else if (e.keyCode === 13 && e.shiftKey) {
        // shift + enter
        return this.button_send_chat(e);
      } else if (e.keyCode === 38 && this.props.input === "") {
        // up arrow and empty
        return this.props.actions.set_to_last_input();
      }
    },

    button_send_chat(e) {
      return send_chat(
        e,
        this.refs.log_container,
        this.props.input,
        this.props.actions
      );
    },

    on_scroll(e) {
      this.props.actions.set_use_saved_position(true);
      const node = ReactDOM.findDOMNode(this.refs.log_container);
      this.props.actions.save_scroll_state(
        node.scrollTop,
        node.scrollHeight,
        node.offsetHeight
      );
      return e.preventDefault();
    },

    componentDidMount() {
      scroll_to_position(
        this.refs.log_container,
        this.props.saved_position,
        this.props.offset,
        this.props.height,
        this.props.use_saved_position,
        this.props.actions
      );
      return this.mark_as_read();
    }, // The act of opening/displaying the chat marks it as seen...
    // since this happens when the user shows it.

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
        return this.props.actions.set_use_saved_position(false);
      }
    },

    componentDidUpdate() {
      if (!this.props.use_saved_position) {
        return scroll_to_bottom(this.refs.log_container, this.props.actions);
      }
    },

    render_collab_caret() {
      let icon;
      if (this.props.add_collab) {
        icon = <Icon name="caret-down" />;
      } else {
        icon = <Icon name="caret-right" />;
      }
      return (
        <div
          style={{
            fontSize: "15pt",
            width: "16px",
            display: "inline-block",
            cursor: "pointer"
          }}
        >
          {icon}
        </div>
      );
    },

    render_add_collab() {
      if (!this.props.add_collab) {
        return;
      }
      const project =
        this.props.project_map != null
          ? this.props.project_map.get(this.props.project_id)
          : undefined;
      if (project == null) {
        return;
      }
      return (
        <div>
          <div style={{ margin: "10px 0px" }}>
            Who else would you like to work with?
          </div>
          <AddCollaborators project={project} inline={true} />
          <span style={{ color: "#666" }}>
            NOTE: Anybody you add can work with you on any file in this project.
            Remove people in settings.
          </span>
        </div>
      );
    },

    render_collab_list() {
      const project =
        this.props.project_map != null
          ? this.props.project_map.get(this.props.project_id)
          : undefined;
      if (project == null) {
        return;
      }
      let style = undefined;
      if (!this.props.add_collab) {
        style = {
          maxHeight: "1.7em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        };
      }
      return (
        <div
          style={style}
          onClick={() =>
            this.props.actions.setState({ add_collab: !this.props.add_collab })
          }
        >
          {this.render_collab_caret()}
          <span style={{ color: "#777", fontSize: "10pt" }}>
            <ProjectUsers
              project={project}
              none={<span>Add people to work with...</span>}
            />
          </span>
        </div>
      );
    },

    render_project_users() {
      return (
        <div style={{ margin: "5px 15px" }}>
          {this.render_collab_list()}
          {this.render_add_collab()}
        </div>
      );
    },

    on_focus() {
      // Remove any active key handler that is next to this side chat.
      // E.g, this is critical for taks lists...
      return this.props.redux.getActions("page").erase_active_key_handler();
    },

    render() {
      if (this.props.messages == null || this.props.redux == null) {
        return <Loading />;
      }

      const mark_as_read = underscore.throttle(this.mark_as_read, 3000);

      // WARNING: making autofocus true would interfere with chat and terminals -- where chat and terminal are both focused at same time sometimes (esp on firefox).

      return (
        <div
          style={{
            height: "100%",
            width: "100%",
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#efefef"
          }}
          onMouseMove={mark_as_read}
          onFocus={this.on_focus}
        >
          {this.render_project_users()}
          <div
            style={log_container_style}
            ref="log_container"
            onScroll={this.on_scroll}
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
              show_heads={false}
            />
          </div>
          <div
            style={{
              marginTop: "auto",
              padding: "5px",
              paddingLeft: "15px",
              paddingRight: "15px"
            }}
          >
            <div style={{ display: "flex", height: "6em" }}>
              <FormControl
                style={{ width: "85%", height: "100%" }}
                autoFocus={false}
                componentClass="textarea"
                ref="input"
                onKeyDown={e => {
                  mark_as_read();
                  return this.on_keydown(e);
                }}
                value={this.props.input}
                placeholder={"Type a message..."}
                onChange={e => this.props.actions.set_input(e.target.value)}
              />
              <Button
                style={{ width: "15%", height: "100%" }}
                onClick={this.button_send_chat}
                disabled={this.props.input === ""}
                bsStyle="success"
              >
                <Icon name="chevron-circle-right" />
              </Button>
            </div>
            <div style={{ color: "#888", padding: "5px" }}>
              Shift+enter to send. Double click to edit. Use{" "}
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
              </a>.
            </div>
          </div>
        </div>
      );
    }
  };
});

// Component for use via React
exports.SideChat = function({ path, redux, project_id }) {
  const name = redux_name(project_id, path);
  const file_use_id = require("smc-util/schema").client_db.sha1(
    project_id,
    path
  );
  const actions = redux.getActions(name);
  return (
    <ChatRoom
      redux={redux}
      actions={redux.getActions(name)}
      name={name}
      project_id={project_id}
      path={path}
      file_use_id={file_use_id}
    />
  );
};

// Fitting the side chat into non-react parts of SMC:

const render = function(redux, project_id, path) {
  const name = redux_name(project_id, path);
  const file_use_id = require("smc-util/schema").client_db.sha1(
    project_id,
    path
  );
  const actions = redux.getActions(name);
  return (
    <ChatRoom
      redux={redux}
      actions={actions}
      name={name}
      project_id={project_id}
      path={path}
      file_use_id={file_use_id}
    />
  );
};

// Render the given chatroom, and return the name of the redux actions/store
exports.render = function(project_id, path, dom_node, redux) {
  const name = init_redux(path, redux, project_id);
  ReactDOM.render(render(redux, project_id, path), dom_node);
  return name;
};

exports.hide = (project_id, path, dom_node, redux) =>
  ReactDOM.unmountComponentAtNode(dom_node);

exports.show = (project_id, path, dom_node, redux) =>
  ReactDOM.render(render(redux, project_id, path), dom_node);

exports.free = function(project_id, path, dom_node, redux) {
  const fname = redux_name(project_id, path);
  const store = redux.getStore(fname);
  if (store == null) {
    return;
  }
  ReactDOM.unmountComponentAtNode(dom_node);
  if (store.syncdb != null) {
    store.syncdb.destroy();
  }
  delete store.state;
  // It is *critical* to first unmount the store, then the actions,
  // or there will be a huge memory leak.
  redux.removeStore(fname);
  return redux.removeActions(fname);
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
