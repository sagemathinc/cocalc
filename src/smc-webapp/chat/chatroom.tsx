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
import { alert_message } from "../alerts";

// have to rewrite buttons like SaveButton in antd before we can
// switch to antd buttons.
import { Button, ButtonGroup } from "react-bootstrap";

import { ChatInput } from "./input";
import {
  compute_cursor_offset_position,
  mark_chat_as_read_if_unseen,
  scroll_to_bottom,
} from "./utils";

import {
  React,
  redux,
  useActions,
  useEffect,
  useRef,
  useRedux,
  useState,
  useStore,
  useMemo,
} from "../app-framework";
import { Icon, Loading, Tip, SearchInput, A } from "../r_misc";
import { Col, Row, Well } from "../antd-bootstrap";
import { ChatLog } from "./chat-log";
import { WindowedList } from "../r_misc/windowed-list";

import { VideoChatButton } from "./video/launch-button";
import { Dropzone, FileUploadWrapper } from "../file-upload";
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

interface Props {
  project_id: string;
  path: string;
}

export const ChatRoom: React.FC<Props> = ({ project_id, path }) => {
  const actions = useActions(project_id, path);
  const store = useStore(project_id, path);
  const font_size = useRedux(["account", "font_size"]);
  const account_id = useRedux(["account", "account_id"]);
  const other_settings = useRedux(["account", "other_settings"]);

  const unsent_user_mentions = useRedux(
    ["unsent_user_mentions"],
    project_id,
    path
  );
  const is_saving = useRedux(["is_saving"], project_id, path);
  const is_preview = useRedux(["is_preview"], project_id, path);
  const has_unsaved_changes = useRedux(
    ["has_unsaved_changes"],
    project_id,
    path
  );
  const has_uncommitted_changes = useRedux(
    ["has_uncommitted_changes"],
    project_id,
    path
  );
  const input: string = useRedux(["input"], project_id, path);
  const search = useRedux(["search"], project_id, path);
  const saved_mesg = useRedux(["saved_mesg"], project_id, path);
  const messages = useRedux(["messages"], project_id, path);

  const [preview, set_preview] = useState("preview");

  const input_ref = useRef<HTMLTextAreaElement>(null);
  const log_container_ref = useRef<WindowedList>(null);
  const dropzone_ref = useRef<Dropzone>(null);
  const close_preview_ref = useRef<Function>(null);

  const project_map = useRedux(["projects", "project_map"]);
  const project_users = useMemo(() => {
    // the immutable.Map() default is because of admins:
    // https://github.com/sagemathinc/cocalc/issues/3669
    return project_map.getIn([project_id, "users"], immutable.Map());
  }, [project_map]);
  const enable_mentions = useMemo(
    () => project_users.size > 1 && other_settings.get("allow_mentions"),
    [project_users, other_settings]
  );

  const user_map = useRedux(["users", "user_map"]);

  useEffect(() => {
    scroll_to_bottom(log_container_ref);
  }, [messages]);

  // The act of opening/displaying the chat marks it as seen...
  useEffect(() => {
    mark_as_read();
  }, []);

  function mark_as_read() {
    mark_chat_as_read_if_unseen(project_id, path);
  }

  function on_send_button_click(e): void {
    e.preventDefault();
    on_send();
  }

  function button_scroll_to_bottom(): void {
    scroll_to_bottom(log_container_ref, true);
  }

  function button_off_click(): void {
    actions.set_is_preview(false);
    input_ref.current?.focus();
  }

  function on_preview_button_click(): void {
    actions.set_is_preview(true);
    input_ref.current?.focus();
  }

  const set_preview_state = debounce(() => {
    set_preview(input);
  }, 250);

  function show_timetravel(): void {
    redux.getProjectActions(project_id).open_file({
      path: history_path(path),
      foreground: true,
      foreground_project: true,
    });
  }

  function render_mention_email(): JSX.Element {
    if (redux.getStore("projects").has_internet_access(project_id)) {
      return <span>(they may receive an email)</span>;
    } else {
      return <span>(enable the Internet Access upgrade to send emails)</span>;
    }
  }

  // All render methods
  function render_bottom_tip(): JSX.Element {
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
          on this project {render_mention_email()}. Double click chat bubbles to
          edit them. Format using{" "}
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

  function render_preview_message(): JSX.Element | undefined {
    if (input.length == 0) return;
    set_preview_state();
    if (preview.length == 0) return;
    const value = sanitize_html_safe(
      smiley({
        s: preview,
        wrap: ['<span class="smc-editor-chat-smiley">', "</span>"],
      })
    );
    const file_path = path != null ? path_split(path).head : undefined;

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
              onClick={button_off_click}
            >
              <Icon name="times" />
            </div>
            <Markdown
              value={value}
              project_id={project_id}
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

  function render_timetravel_button(): JSX.Element {
    return (
      <Button onClick={show_timetravel} bsStyle="info">
        <Tip
          title="TimeTravel"
          tip={<span>Browse all versions of this chatroom.</span>}
          placement="left"
        >
          <Icon name="history" /> TimeTravel
        </Tip>
      </Button>
    );
  }

  function render_bottom_button(): JSX.Element {
    return (
      <Button onClick={button_scroll_to_bottom}>
        <Tip
          title="Scroll to Bottom"
          tip={<span>Scrolls the chat to the bottom</span>}
          placement="left"
        >
          <Icon name="arrow-down" /> Bottom
        </Tip>
      </Button>
    );
  }

  function render_save_button() {
    return (
      <SaveButton
        onClick={() => actions.save_to_disk()}
        is_saving={is_saving}
        has_unsaved_changes={has_unsaved_changes}
        has_uncommitted_changes={has_uncommitted_changes}
      />
    );
  }

  function render_video_chat_button() {
    if (project_id == null || path == null) return;
    return (
      <VideoChatButton
        project_id={project_id}
        path={path}
        button={true}
        label={"Video Chat"}
      />
    );
  }

  function render_search() {
    return (
      <SearchInput
        placeholder={"Find messages..."}
        default_value={search}
        on_change={debounce(
          (value) => actions.setState({ search: value }),
          500
        )}
        style={{ margin: 0 }}
      />
    );
  }

  function render_button_row() {
    return (
      <Row style={{ marginTop: "5px" }}>
        <Col xs={6} md={6} style={{ padding: "2px" }}>
          {render_search()}
        </Col>
        <Col
          xs={6}
          md={6}
          className="pull-right"
          style={{ padding: "2px", textAlign: "right" }}
        >
          <ButtonGroup>
            {render_save_button()}
            {render_timetravel_button()}
            {render_video_chat_button()}
            {render_bottom_button()}
          </ButtonGroup>
        </Col>
      </Row>
    );
  }

  function generate_temp_upload_text(file: { name: string }): string {
    return `[Uploading...]\(${file.name}\)`;
  }

  function start_upload(file: { name: string }): void {
    // need version now, not when function was created
    const input = store.get(enable_mentions ? "message_plain_text" : "input");
    const text_area = input_ref.current;
    if (text_area == null) return;
    const temporary_insertion_text = generate_temp_upload_text(file);
    const start_pos = compute_cursor_offset_position(
      text_area.selectionStart,
      unsent_user_mentions
    );
    const end_pos = compute_cursor_offset_position(
      text_area.selectionEnd,
      unsent_user_mentions
    );
    const temp_new_text =
      input.slice(0, start_pos) +
      temporary_insertion_text +
      input.slice(end_pos);
    text_area.selectionStart = end_pos;
    text_area.selectionEnd = end_pos;
    actions.set_input(temp_new_text);
  }

  function append_file(file: {
    type: string;
    name: string;
    status: string;
  }): void {
    // need input now, not when function was created
    const input = store.get(enable_mentions ? "message_plain_text" : "input");
    let final_insertion_text;
    if (file.status == "error") {
      final_insertion_text = "";
      alert_message({ type: "error", message: "Error uploading file." });
    } else if (file.type.indexOf("image") !== -1) {
      final_insertion_text = `<img src=\".chat-images/${file.name}\" style="max-width:100%">`;
    } else {
      final_insertion_text = `[${file.name}](${file.name})`;
    }

    const temporary_insertion_text = generate_temp_upload_text(file);
    const start_index = input.indexOf(temporary_insertion_text);
    const end_index = start_index + temporary_insertion_text.length;

    if (start_index === -1) {
      return;
    }

    const new_text =
      input.slice(0, start_index) +
      final_insertion_text +
      input.slice(end_index);
    actions.set_input(new_text);
  }

  function handle_paste_event(e: React.ClipboardEvent<any>): void {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item != null && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file != null) {
          const blob = file.slice(0, -1, item.type);
          dropzone_ref.current?.addFile(
            new File([blob], `paste-${Math.random()}`, { type: item.type })
          );
        }
        return;
      }
    }
  }

  function on_send(): void {
    scroll_to_bottom(log_container_ref, true);
    actions.submit_user_mentions();
    actions.send_chat();
    input_ref.current?.focus?.();
    close_preview_ref.current?.();
  }

  function on_clear(): void {
    actions.set_input("");
  }

  function render_body(): JSX.Element {
    return (
      <div className="smc-vfill" style={GRID_STYLE}>
        {!IS_MOBILE ? render_button_row() : undefined}
        <div className="smc-vfill" style={CHAT_LOG_STYLE}>
          <ChatLog
            windowed_list_ref={log_container_ref}
            messages={messages}
            account_id={account_id}
            user_map={user_map}
            project_id={project_id}
            font_size={font_size}
            file_path={path != null ? path_split(path).head : undefined}
            actions={actions}
            saved_mesg={saved_mesg}
            search={search}
            show_heads={true}
          />
          {is_preview && render_preview_message()}
        </div>
        <div style={{ display: "flex", maxWidth: "100vw" }}>
          <div
            style={{ flex: "1", padding: "0px 2px 0px 2px", width: "250px" }}
          >
            <FileUploadWrapper
              project_id={project_id}
              dest_path={normalized_path_join(
                redux.getProjectStore(project_id).get("current_path"),
                "/.chat-images"
              )}
              event_handlers={{
                complete: append_file,
                sending: start_upload,
              }}
              style={{ height: "100%" }}
              dropzone_ref={dropzone_ref}
              close_preview_ref={close_preview_ref}
            >
              <ChatInput
                project_id={project_id}
                path={path}
                input={input}
                input_ref={input_ref}
                enable_mentions={enable_mentions}
                project_users={project_users}
                user_store={redux.getStore("users")}
                height={"100px"}
                on_paste={handle_paste_event}
                on_clear={on_clear}
                on_send={on_send}
                on_set_to_last_input={() => actions.set_to_last_input()}
                account_id={account_id}
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
                onClick={on_preview_button_click}
                disabled={input === ""}
                bsStyle="info"
                style={{ height: "50%", width: "100%" }}
              >
                Preview
              </Button>
            ) : undefined}
            <Button
              onClick={on_send_button_click}
              disabled={input === ""}
              bsStyle="success"
              style={{ flex: 1, width: "100%" }}
            >
              Send
            </Button>
          </div>
        </div>
        <div>{!IS_MOBILE ? render_bottom_tip() : undefined}</div>
      </div>
    );
  }

  if (messages == null || input == null) {
    return <Loading theme={"medium"} />;
  }
  return (
    <div
      onMouseMove={mark_as_read}
      onClick={mark_as_read}
      className="smc-vfill"
    >
      {render_body()}
    </div>
  );
};
