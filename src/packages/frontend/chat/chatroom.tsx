/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// standard non-CoCalc libraries
import { debounce } from "lodash";
import { useDebounce } from "use-debounce";

// CoCalc libraries
import { history_path, path_split } from "@cocalc/util/misc";
import { sanitize_html_safe } from "../misc";
import { SaveButton } from "../frame-editors/frame-tree/save-button";

// have to rewrite buttons like SaveButton in antd before we can
// switch to antd buttons.
import { Button, ButtonGroup } from "@cocalc/frontend/antd-bootstrap";

import { ChatInput } from "./input";
import { mark_chat_as_read_if_unseen, INPUT_HEIGHT } from "./utils";

import {
  React,
  redux,
  useActions,
  useEffect,
  useRef,
  useRedux,
} from "../app-framework";
import { Icon, Loading, Tip, SearchInput, VisibleMDLG } from "../components";
import { Col, Row, Well } from "../antd-bootstrap";
import { ChatLog } from "./chat-log";

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
  const scrollToBottomRef = useRef<any>(null);

  useEffect(() => {
    scrollToBottomRef.current?.();
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
    scrollToBottomRef.current?.(true);
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
    const value = sanitize_html_safe(preview);
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
          <Icon name="history" /> <VisibleMDLG>TimeTravel</VisibleMDLG>
        </Tip>
      </Button>
    );
  }

  function render_bottom_button(): JSX.Element {
    return (
      <Button onClick={button_scroll_to_bottom}>
        <Tip
          title="Newest Messages"
          tip={
            <span>
              Scrolls the chat to the bottom showing the newest messages
            </span>
          }
          placement="left"
        >
          <Icon name="arrow-down" /> <VisibleMDLG>Newest Messages</VisibleMDLG>
        </Tip>
      </Button>
    );
  }

  function render_increase_font_size(): JSX.Element {
    return (
      <Button onClick={() => actions.change_font_size(1)}>
        <Tip
          title="Increase font size"
          tip={<span>Make the font size larger for chat messages</span>}
          placement="left"
        >
          <Icon name="search-plus" />
        </Tip>
      </Button>
    );
  }

  function render_decrease_font_size(): JSX.Element {
    return (
      <Button onClick={() => actions.change_font_size(-1)}>
        <Tip
          title="Decrease font size"
          tip={<span>Make the font size smaller for chat messages</span>}
          placement="left"
        >
          <Icon name="search-minus" />
        </Tip>
      </Button>
    );
  }

  function render_export_button(): JSX.Element {
    return (
      <Button
        onClick={() => actions.export_to_markdown()}
        style={{ marginLeft: "5px" }}
      >
        <Icon name="external-link" /> Export
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
        label={<VisibleMDLG>Video Chat</VisibleMDLG>}
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
      <Row style={{ marginLeft: 0, marginRight: 0 }}>
        <Col xs={9} md={9} style={{ padding: "2px" }}>
          <ButtonGroup>
            {render_save_button()}
            {render_timetravel_button()}
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "5px" }}>
            {render_video_chat_button()}
            {render_bottom_button()}
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "5px" }}>
            {render_decrease_font_size()}
            {render_increase_font_size()}
          </ButtonGroup>
          {render_export_button()}
        </Col>
        <Col xs={3} md={3} style={{ padding: "2px" }}>
          {render_search()}
        </Col>
      </Row>
    );
  }

  function on_send(): void {
    const value = submitMentionsRef.current?.();
    scrollToBottomRef.current?.(true);
    actions.send_chat(value);
  }

  function render_body(): JSX.Element {
    return (
      <div className="smc-vfill" style={GRID_STYLE}>
        {render_button_row()}
        <div className="smc-vfill" style={CHAT_LOG_STYLE}>
          <ChatLog
            project_id={project_id}
            path={path}
            scrollToBottomRef={scrollToBottomRef}
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
              input={input}
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
              onClick={on_send_button_click}
              disabled={input.trim() === "" || is_uploading}
              bsStyle="success"
              style={{ height: "47.5px" }}
            >
              Send
            </Button>
            <div style={{ height: "5px" }} />
            <Button
              onClick={() => actions.set_is_preview(true)}
              bsStyle="info"
              style={{ height: "47.5px" }}
              disabled={is_preview}
            >
              Preview
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
