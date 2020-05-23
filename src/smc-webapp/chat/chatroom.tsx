/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// standard non-CoCalc libraries
import * as immutable from "immutable";
import { debounce } from "lodash";
const { IS_MOBILE } = require("../feature");

// CoCalc libraries
import {
  smiley,
  history_path,
  emoticons,
  path_split,
  normalized_path_join,
} from "smc-util/misc";
const { sanitize_html_safe } = require("../misc_page");
import { DISCORD_INVITE } from "smc-util/theme";
import { SaveButton } from "../frame-editors/frame-tree/save-button";

// have to rewrite buttons like SaveButton in antd before we can
// switch to antd buttons.
import { Button, ButtonGroup } from "react-bootstrap";

import { ChatInput } from "./input";
import { compute_cursor_offset_position, scroll_to_bottom } from "./utils";
import { MentionList } from "./store";

import { React, Component, rclass, rtypes } from "../app-framework";
import { Icon, Loading, Tip, SearchInput, A } from "../r_misc";
import { Col, Row, Well } from "../antd-bootstrap";
import { ChatLog } from "./chat-log";
import { WindowedList } from "../r_misc/windowed-list";

import { VideoChatButton } from "./video/launch-button";
import { FileUploadWrapper } from "../file-upload";
import { Markdown } from "./markdown";
import { TIP_TEXT } from "../widget-markdown-input/main";

const PREVIEW_STYLE: React.CSSProperties = {
  background: "#f5f5f5",
  fontSize: "14px",
  borderRadius: "10px 10px 10px 10px",
  boxShadow: "#666 3px 3px 3px",
  paddingBottom: "20px",
  maxHeight: "50vh",
  overflowY: "auto",
};

const GRID_STYLE: React.CSSProperties = {
  maxWidth: "1200px",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  margin: "auto",
};

const CHAT_LOG_STYLE: React.CSSProperties = {
  margin: "0",
  padding: "0",
  background: "white",
  flex: "1 0 auto",
  position: "relative",
};

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
  font_size: number;
  file_use?: any;
  is_saving: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  unsent_user_mentions: MentionList;
  other_settings: Map<string, any>;
}

type ChatRoomProps = ChatRoomOwnProps & ChatRoomReduxProps;

interface ChatRoomState {
  preview: string;
}

class ChatRoom0 extends Component<ChatRoomProps, ChatRoomState> {
  public static defaultProps = {
    font_size: 14,
  };

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
        has_uncommitted_changes: rtypes.bool,
        unsent_user_mentions: rtypes.immutable.List,
      },

      users: {
        user_map: rtypes.immutable,
      },

      projects: {
        project_map: rtypes.immutable,
      },

      account: {
        account_id: rtypes.string,
        font_size: rtypes.number,
        other_settings: rtypes.immutable.Map,
      },

      file_use: {
        file_use: rtypes.immutable,
      },
    };
  }

  public static propTypes = {
    redux: rtypes.object,
    actions: rtypes.object,
    name: rtypes.string.isRequired,
    project_id: rtypes.string.isRequired,
    path: rtypes.string,
  };

  private input_ref = React.createRef<HTMLTextAreaElement>();
  private log_container_ref = React.createRef<WindowedList>();
  private dropzone_ref: { current: any } = { current: null };
  private close_preview_ref: { current: Function | null } = { current: null };

  constructor(props: ChatRoomProps, context: any) {
    super(props, context);
    this.state = { preview: "" };
  }

  componentDidUpdate() {
    scroll_to_bottom(this.log_container_ref);
  }

  mark_as_read = debounce(() => {
    const info = this.props.redux
      .getStore("file_use")
      .get_file_info(this.props.project_id, this.props.path);
    if (info == null || info.is_unread) {
      // file is unread from *our* point of view, so mark read
      this.props.redux
        .getActions("file_use")
        ?.mark_file(this.props.project_id, this.props.path, "read", 2000);
    }
  }, 300);

  on_send_button_click = (e) => {
    e.preventDefault();
    this.on_send(this.props.input);
  };

  button_scroll_to_bottom = () => {
    scroll_to_bottom(this.log_container_ref, true);
  };

  button_off_click = () => {
    this.props.actions.set_is_preview(false);
    if (this.input_ref.current != null) {
      this.input_ref.current.focus();
    }
  };

  on_preview_button_click = () => {
    this.props.actions.set_is_preview(true);
    if (this.input_ref.current != null) {
      this.input_ref.current.focus();
    }
  };

  set_preview_state = debounce(() => {
    this.setState({ preview: this.props.input });
  }, 250);

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
          path: history_path(this.props.path),
          foreground: true,
          foreground_project: true,
        })
      : undefined;
  };

  render_mention_email() {
    if (
      this.props.redux
        .getStore("projects")
        .has_internet_access(this.props.project_id)
    ) {
      return <span>(they may receive an email)</span>;
    } else {
      return <span>(enable the Internet Access upgrade to send emails)</span>;
    }
  }

  // All render methods
  render_bottom_tip() {
    const tip = (
      <span>
        {TIP_TEXT} Press Shift+Enter to send your chat. Double click to edit
        past chats.
      </span>
    );

    return (
      <Tip title="Use Markdown" tip={tip} delayShow={2500}>
        <div
          style={{ color: "#767676", fontSize: "12.5px", marginBottom: "5px" }}
        >
          Shift+Enter to send your message. Use @name to mention a collaborator
          on this project {this.render_mention_email()}. Double click chat
          bubbles to edit them. Format using{" "}
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
          . Emoticons: {emoticons}. Chat outside CoCalc{" "}
          <A href={DISCORD_INVITE}>on Discord</A>.
        </div>
      </Tip>
    );
  }

  render_preview_message() {
    this.set_preview_state();
    if (this.state.preview.length > 0) {
      let value = this.state.preview;
      value = smiley({
        s: value,
        wrap: ['<span class="smc-editor-chat-smiley">', "</span>"],
      });
      value = sanitize_html_safe(value);
      const file_path =
        this.props.path != null ? path_split(this.props.path).head : undefined;

      return (
        <Row style={{ position: "absolute", bottom: "0px", width: "100%" }}>
          <Col xs={0} sm={2} />

          <Col xs={10} sm={9}>
            <Well style={PREVIEW_STYLE}>
              <div
                className="pull-right lighten"
                style={{
                  marginRight: "-8px",
                  marginTop: "-10px",
                  cursor: "pointer",
                  fontSize: "13pt",
                }}
                onClick={this.button_off_click}
              >
                <Icon name="times" />
              </div>
              <Markdown
                value={value}
                project_id={this.props.project_id}
                file_path={file_path}
              />
              <div className="small lighten" style={{ marginTop: "15px" }}>
                Preview (press Shift+Enter to send)
              </div>
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
    if (this.props.project_id == null || this.props.path == null) return;
    return (
      <VideoChatButton
        project_id={this.props.project_id}
        path={this.props.path}
        button={true}
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
          (value) => this.props.actions.setState({ search: value }),
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

  generate_temp_upload_text = (file) => {
    return `[Uploading...]\(${file.name}\)`;
  };

  start_upload = (file) => {
    const text_area = this.input_ref.current;
    if (text_area == null) return;
    const temporary_insertion_text = this.generate_temp_upload_text(file);
    const start_pos = compute_cursor_offset_position(
      text_area.selectionStart,
      this.props.unsent_user_mentions
    );
    const end_pos = compute_cursor_offset_position(
      text_area.selectionEnd,
      this.props.unsent_user_mentions
    );
    const temp_new_text =
      this.props.input.slice(0, start_pos) +
      temporary_insertion_text +
      this.props.input.slice(end_pos);
    text_area.selectionStart = end_pos;
    text_area.selectionEnd = end_pos;
    this.props.actions.set_input(temp_new_text);
  };

  append_file = (file) => {
    let final_insertion_text;
    if (file.type.indexOf("image") !== -1) {
      final_insertion_text = `<img src=\".chat-images/${file.name}\" style="max-width:100%">`;
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
    this.props.actions.set_input(new_text);
  };

  handle_paste_event = (e: React.ClipboardEvent<any>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item != null && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file != null) {
          const blob = file.slice(0, -1, item.type);
          this.dropzone_ref.current?.addFile(
            new File([blob], `paste-${Math.random()}`, { type: item.type })
          );
        }
        return;
      }
    }
  };

  on_input_change = (value, mentions, plain_text) => {
    this.props.actions.set_unsent_user_mentions(mentions, plain_text);
    this.props.actions.set_input(value);
    this.mark_as_read();
  };

  on_send = (input) => {
    scroll_to_bottom(this.log_container_ref, true);
    this.props.actions.submit_user_mentions();
    this.props.actions.send_chat(input);
    if (
      this.input_ref.current != null &&
      this.input_ref.current.focus != null
    ) {
      this.input_ref.current.focus();
    }
    this.close_preview_ref.current?.();
  };

  on_clear = () => {
    this.props.actions.set_input("");
  };

  render_body() {
    // the immutable.Map() default is because of admins:
    // https://github.com/sagemathinc/cocalc/issues/3669
    const project_users = this.props.project_map.getIn(
      [this.props.project_id, "users"],
      immutable.Map()
    );
    const has_collaborators = project_users.size > 1;

    return (
      <div className="smc-vfill" style={GRID_STYLE}>
        {!IS_MOBILE ? this.render_button_row() : undefined}
        <div className="smc-vfill" style={CHAT_LOG_STYLE}>
          <ChatLog
            windowed_list_ref={this.log_container_ref}
            messages={this.props.messages}
            account_id={this.props.account_id}
            user_map={this.props.user_map}
            project_id={this.props.project_id}
            font_size={this.props.font_size}
            file_path={
              this.props.path != null
                ? path_split(this.props.path).head
                : undefined
            }
            actions={this.props.actions}
            saved_mesg={this.props.saved_mesg}
            search={this.props.search}
            show_heads={true}
          />
          {this.props.input.length > 0 && this.props.is_preview
            ? this.render_preview_message()
            : undefined}
        </div>
        <div style={{ display: "flex", maxWidth: "100vw" }}>
          <div
            style={{ flex: "1", padding: "0px 2px 0px 2px", width: "250px" }}
          >
            <FileUploadWrapper
              project_id={this.props.project_id}
              dest_path={normalized_path_join(
                this.props.redux
                  .getProjectStore(this.props.project_id)
                  .get("current_path"),
                "/.chat-images"
              )}
              event_handlers={{
                complete: this.append_file,
                sending: this.start_upload,
              }}
              style={{ height: "100%" }}
              dropzone_ref={this.dropzone_ref}
              close_preview_ref={this.close_preview_ref}
            >
              <ChatInput
                input={this.props.input}
                input_ref={this.input_ref}
                enable_mentions={
                  has_collaborators &&
                  this.props.other_settings.get("allow_mentions")
                }
                project_users={project_users}
                user_store={this.props.redux.getStore("users")}
                font_size={this.props.font_size}
                height={"100px"}
                on_paste={this.handle_paste_event}
                on_change={this.on_input_change}
                on_clear={this.on_clear}
                on_send={this.on_send}
                on_set_to_last_input={() =>
                  this.props.actions.set_to_last_input()
                }
                account_id={this.props.account_id}
              />
            </FileUploadWrapper>
          </div>
          <div
            style={{
              height: "90px",
              padding: "0",
              marginBottom: "0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {!IS_MOBILE ? (
              <Button
                onClick={this.on_preview_button_click}
                disabled={this.props.input === ""}
                bsStyle="info"
                style={{ height: "50%", width: "100%" }}
              >
                Preview
              </Button>
            ) : undefined}
            <Button
              onClick={this.on_send_button_click}
              disabled={this.props.input === ""}
              bsStyle="success"
              style={{ flex: 1, width: "100%" }}
            >
              Send
            </Button>
          </div>
        </div>
        <div>{!IS_MOBILE ? this.render_bottom_tip() : undefined}</div>
      </div>
    );
  }

  render() {
    if (
      this.props.messages == null ||
      this.props.redux == null ||
      (this.props.input != null ? this.props.input.length : undefined) == null
    ) {
      return <Loading theme={"medium"} />;
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
