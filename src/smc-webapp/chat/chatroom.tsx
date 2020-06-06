/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// standard non-CoCalc libraries
import { debounce } from "lodash";
import { useDebounce } from "use-debounce";
const { IS_MOBILE } = require("../feature");

// CoCalc libraries
import { smiley, history_path, path_split } from "smc-util/misc";
const { sanitize_html_safe } = require("../misc_page");
import { SaveButton } from "../frame-editors/frame-tree/save-button";

// have to rewrite buttons like SaveButton in antd before we can
// switch to antd buttons.
import { Button, ButtonGroup } from "react-bootstrap";

import { ChatInput } from "./input";
import {
  mark_chat_as_read_if_unseen,
  scroll_to_bottom,
  INPUT_HEIGHT,
} from "./utils";

import {
  React,
  redux,
  useActions,
  useEffect,
  useRef,
  useRedux,
} from "../app-framework";
import { Icon, Loading, Tip, SearchInput } from "../r_misc";
import { Col, Row, Well } from "../antd-bootstrap";
import { ChatLog } from "./chat-log";
import { WindowedList } from "../r_misc/windowed-list";

import { VideoChatButton } from "./video/launch-button";
import { Markdown } from "./markdown";

const PREVIEW_STYLE: React.CSSProperties = {
  background: "#f5f5f5",
  fontSize: "14px",
  borderRadius: "10px 10px 10px 10px",
  boxShadow: "#666 3px 3px 3px",
  paddingBottom: "20px",
  maxHeight: "40vh",
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

  const is_uploading = useRedux(["is_uploading"], project_id, path);
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
  const [preview] = useDebounce(input, 250);

  const search = useRedux(["search"], project_id, path);
  const messages = useRedux(["messages"], project_id, path);

  const submitMentionsRef = useRef<Function>();

  const log_container_ref = useRef<WindowedList>(null);

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

  function show_timetravel(): void {
    redux.getProjectActions(project_id).open_file({
      path: history_path(path),
      foreground: true,
      foreground_project: true,
    });
  }

  function render_preview_message(): JSX.Element | undefined {
    if (input.length == 0 || preview.length == 0) return;
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
              onClick={() => actions.set_is_preview(false)}
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
          250
        )}
        style={{ margin: 0, width: "100%", marginBottom: "5px" }}
      />
    );
  }

  function render_button_row() {
    return (
      <Row style={{ marginTop: "5px" }}>
        <Col xs={6} md={6} style={{ padding: "2px", textAlign: "right" }}>
          <ButtonGroup>
            {render_save_button()}
            {render_timetravel_button()}
            {render_video_chat_button()}
            {render_bottom_button()}
          </ButtonGroup>
        </Col>
        <Col xs={6} md={6} style={{ padding: "2px" }}>
          {render_search()}
        </Col>
      </Row>
    );
  }

  function on_send(): void {
    const value = submitMentionsRef.current?.();
    scroll_to_bottom(log_container_ref, true);
    actions.send_chat(value);
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
            project_id={project_id}
            path={path}
            windowed_list_ref={log_container_ref}
            show_heads={true}
          />
          {is_preview && render_preview_message()}
        </div>
        <div style={{ display: "flex", marginBottom: "5px" }}>
          <div
            style={{
              flex: "1",
              padding: "0px 5px 0px 2px",
            }}
          >
            <ChatInput
              project_id={project_id}
              path={path}
              input={input}
              on_clear={on_clear}
              on_send={on_send}
              height={INPUT_HEIGHT}
              onChange={(value) => actions.set_input(value)}
              submitMentionsRef={submitMentionsRef}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "0",
              marginBottom: "0",
            }}
          >
            <div style={{ flex: 1 }} />
            <Button
              onClick={() => actions.set_is_preview(true)}
              bsStyle="info"
              style={{ height: "47.5px" }}
              disabled={is_preview}
            >
              Preview
            </Button>
            <div style={{ height: "5px" }} />
            <Button
              onClick={on_send_button_click}
              disabled={input.trim() === "" || is_uploading}
              bsStyle="success"
              style={{ height: "47.5px" }}
            >
              Send
            </Button>
          </div>
        </div>
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
