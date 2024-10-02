/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Divider, Input, Select, Space, Tooltip } from "antd";
import { debounce } from "lodash";
import { useDebounce } from "use-debounce";
import {
  ButtonGroup,
  Col,
  Button as OldButton,
  Row,
  Well,
} from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  useActions,
  useEffect,
  useRedux,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, Tip, VisibleMDLG } from "@cocalc/frontend/components";
import { computeServersEnabled } from "@cocalc/frontend/compute/config";
import SelectComputeServerForFile from "@cocalc/frontend/compute/select-server-for-file";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { SaveButton } from "@cocalc/frontend/frame-editors/frame-tree/save-button";
import { hoursToTimeIntervalHuman } from "@cocalc/util/misc";
import { FormattedMessage } from "react-intl";
import { ChatActions } from "./actions";
import { ChatLog } from "./chat-log";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import { SubmitMentionsFn } from "./types";
import { INPUT_HEIGHT, markChatAsReadIfUnseen } from "./utils";
import VideoChatButton from "./video/launch-button";
import Filter from "./filter";

const FILTER_RECENT_NONE = {
  value: 0,
  label: (
    <>
      <Icon name="clock" /> All
    </>
  ),
} as const;

const PREVIEW_STYLE: React.CSSProperties = {
  background: "#f5f5f5",
  fontSize: "14px",
  borderRadius: "10px 10px 10px 10px",
  boxShadow: "#666 3px 3px 3px",
  paddingBottom: "20px",
  maxHeight: "40vh",
  overflowY: "auto",
} as const;

const GRID_STYLE: React.CSSProperties = {
  maxWidth: "1200px",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  margin: "auto",
} as const;

const CHAT_LOG_STYLE: React.CSSProperties = {
  padding: "0",
  background: "white",
  flex: "1 0 auto",
  position: "relative",
} as const;

interface Props {
  project_id: string;
  path: string;
  is_visible?: boolean;
}

export function ChatRoom({ project_id, path, is_visible }: Props) {
  const actions: ChatActions = useActions(project_id, path);
  const is_uploading = useRedux(["is_uploading"], project_id, path);
  const is_saving = useRedux(["is_saving"], project_id, path);
  const is_preview = useRedux(["is_preview"], project_id, path);
  const has_unsaved_changes = useRedux(
    ["has_unsaved_changes"],
    project_id,
    path,
  );
  const has_uncommitted_changes = useRedux(
    ["has_uncommitted_changes"],
    project_id,
    path,
  );
  const input: string = useRedux(["input"], project_id, path);
  const [preview] = useDebounce(input, 250);

  const search = useRedux(["search"], project_id, path);
  const messages = useRedux(["messages"], project_id, path);
  const filterRecentH: number = useRedux(["filterRecentH"], project_id, path);
  const [filterRecentHCustom, setFilterRecentHCustom] = useState<string>("");
  const [filterRecentOpen, setFilterRecentOpen] = useState<boolean>(false);
  const llm_cost_room: [number, number] = useRedux(
    ["llm_cost_room"],
    project_id,
    path,
  );

  const submitMentionsRef = useRef<SubmitMentionsFn>();
  const scrollToBottomRef = useRef<any>(null);

  // The act of opening/displaying the chat marks it as seen...
  useEffect(() => {
    mark_as_read();
  }, []);

  function mark_as_read() {
    markChatAsReadIfUnseen(project_id, path);
  }

  function on_send_button_click(e): void {
    e.preventDefault();
    on_send();
  }

  function button_scroll_to_bottom(): void {
    scrollToBottomRef.current?.(true);
  }

  function show_timetravel(): void {
    actions.showTimeTravelInNewTab();
  }

  function render_preview_message(): JSX.Element | undefined {
    if (!is_preview) return;
    if (input.length === 0 || preview.length === 0) return;

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
            <StaticMarkdown value={preview} />
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
      <OldButton onClick={show_timetravel} bsStyle="info">
        <Tip
          title="TimeTravel"
          tip={<span>Browse all versions of this chatroom.</span>}
          placement="left"
        >
          <Icon name="history" /> <VisibleMDLG>TimeTravel</VisibleMDLG>
        </Tip>
      </OldButton>
    );
  }

  function render_bottom_button(): JSX.Element {
    return (
      <Button onClick={button_scroll_to_bottom}>
        <Tip
          title={
            <FormattedMessage
              id="chatroom.scroll_bottom.tooltip.title"
              defaultMessage={"Newest Messages"}
            />
          }
          tip={
            <span>
              <FormattedMessage
                id="chatroom.scroll_bottom.tooltip.tip"
                defaultMessage={
                  "Scrolls the chat to the bottom showing the newest messages"
                }
              />
            </span>
          }
          placement="left"
        >
          <Icon name="arrow-down" />{" "}
          <VisibleMDLG>
            {" "}
            <FormattedMessage
              id="chatroom.scroll_bottom.label"
              defaultMessage={"Newest"}
            />
          </VisibleMDLG>
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
      <VisibleMDLG>
        <Button
          title={"Export to Markdown"}
          onClick={() => actions.export_to_markdown()}
          style={{ marginLeft: "5px" }}
        >
          <Icon name="external-link" />
        </Button>
      </VisibleMDLG>
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

  function render_compute_server_button() {
    if (!computeServersEnabled()) {
      return null;
    }

    return (
      <SelectComputeServerForFile
        actions={actions}
        key="compute-server-selector"
        type={"sage-chat"}
        project_id={project_id}
        path={path}
        style={{
          height: "32px",
          overflow: "hidden",
          borderTopRightRadius: "5px",
          borderBottomRightRadius: "5px",
        }}
        noLabel={true}
      />
    );
  }

  function render_video_chat_button() {
    if (project_id == null || path == null) return;
    return (
      <VideoChatButton
        project_id={project_id}
        path={path}
        sendChat={(value) => actions.send_chat({ input: value })}
        label={"Video"}
      />
    );
  }

  function isValidFilterRecentCustom(): boolean {
    const v = parseFloat(filterRecentHCustom);
    return isFinite(v) && v >= 0;
  }

  function renderFilterRecent() {
    return (
      <Tooltip title="Only show recent threads.">
        <Select
          open={filterRecentOpen}
          onDropdownVisibleChange={(v) => setFilterRecentOpen(v)}
          value={filterRecentH}
          status={filterRecentH > 0 ? "warning" : undefined}
          allowClear
          onClear={() => {
            actions.setState({ filterRecentH: 0 });
            setFilterRecentHCustom("");
          }}
          style={{ width: 120 }}
          popupMatchSelectWidth={false}
          onSelect={(val: number) => actions.setState({ filterRecentH: val })}
          options={[
            FILTER_RECENT_NONE,
            ...[1, 6, 12, 24, 48, 24 * 7, 14 * 24, 28 * 24].map((value) => {
              const label = hoursToTimeIntervalHuman(value);
              return { value, label };
            }),
          ]}
          labelRender={({ label, value }) => {
            if (!label) {
              if (isValidFilterRecentCustom()) {
                value = parseFloat(filterRecentHCustom);
                label = hoursToTimeIntervalHuman(value);
              } else {
                ({ label, value } = FILTER_RECENT_NONE);
              }
            }
            return (
              <Tooltip
                title={
                  value === 0
                    ? undefined
                    : `Only threads with messages sent in the past ${label}.`
                }
              >
                {label}
              </Tooltip>
            );
          }}
          dropdownRender={(menu) => (
            <>
              {menu}
              <Divider style={{ margin: "8px 0" }} />
              <Input
                placeholder="Number of hours"
                allowClear
                value={filterRecentHCustom}
                status={
                  filterRecentHCustom == "" || isValidFilterRecentCustom()
                    ? undefined
                    : "error"
                }
                onChange={debounce(
                  (e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value;
                    setFilterRecentHCustom(v);
                    const val = parseFloat(v);
                    if (isFinite(val) && val >= 0) {
                      actions.setState({ filterRecentH: val });
                    } else if (v == "") {
                      actions.setState({
                        filterRecentH: FILTER_RECENT_NONE.value,
                      });
                    }
                  },
                  150,
                  { leading: true, trailing: true },
                )}
                onKeyDown={(e) => e.stopPropagation()}
                onPressEnter={() => setFilterRecentOpen(false)}
                addonAfter={<span style={{ paddingLeft: "5px" }}>hours</span>}
              />
            </>
          )}
        />
      </Tooltip>
    );
  }

  function render_button_row() {
    return (
      <Space style={{ width: "100%", marginTop: "3px" }} wrap>
        <ButtonGroup>
          {render_save_button()}
          {render_timetravel_button()}
          {render_compute_server_button()}
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
        {actions.syncdb != null && (
          <VisibleMDLG>
            <ButtonGroup style={{ marginLeft: "5px" }}>
              <Button onClick={() => actions.syncdb?.undo()} title="Undo">
                <Icon name="undo" />
              </Button>
              <Button onClick={() => actions.syncdb?.redo()} title="Redo">
                <Icon name="redo" />
              </Button>
            </ButtonGroup>
          </VisibleMDLG>
        )}
        {actions.help != null && (
          <Button
            onClick={() => actions.help()}
            style={{ marginLeft: "5px" }}
            title="Documentation"
          >
            <Icon name="question-circle" />
          </Button>
        )}

        <Filter
          actions={actions}
          search={search}
          style={{
            margin: 0,
            width: "100%",
            ...(messages.size >= 2
              ? undefined
              : { visibility: "hidden", height: 0 }),
          }}
        />
        {renderFilterRecent()}
      </Space>
    );
  }

  function on_send(): void {
    const input = submitMentionsRef.current?.();
    scrollToBottomRef.current?.(true);
    actions.send_chat({ input });
    setTimeout(() => {
      scrollToBottomRef.current?.(true);
    }, 100);
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
            mode={"standalone"}
          />
          {render_preview_message()}
        </div>
        <div style={{ display: "flex", marginBottom: "5px", overflow: "auto" }}>
          <div
            style={{
              flex: "1",
              padding: "0px 5px 0px 2px",
            }}
          >
            <ChatInput
              autoFocus
              cacheId={`${path}${project_id}-new`}
              input={input}
              on_send={on_send}
              height={INPUT_HEIGHT}
              onChange={(value) => {
                actions.set_input(value);
                // submitMentionsRef will not actually submit mentions; we're only interested in the reply value
                const reply =
                  submitMentionsRef.current?.(undefined, true) ?? value;
                actions?.llm_estimate_cost(reply, "room");
              }}
              submitMentionsRef={submitMentionsRef}
              syncdb={actions.syncdb}
              date={0}
              editBarStyle={{ overflow: "auto" }}
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
            <LLMCostEstimationChat
              llm_cost={llm_cost_room}
              compact
              style={{
                flex: 0,
                fontSize: "85%",
                textAlign: "center",
                margin: "0 0 5px 0",
              }}
            />
            <Tooltip
              title={
                <FormattedMessage
                  id="chatroom.chat_input.send_button.tooltip"
                  defaultMessage={"Send message (shift+enter)"}
                />
              }
            >
              <Button
                onClick={on_send_button_click}
                disabled={input.trim() === "" || is_uploading}
                type="primary"
                style={{ height: "47.5px" }}
                icon={<Icon name="paper-plane" />}
              >
                <FormattedMessage
                  id="chatroom.chat_input.send_button.label"
                  defaultMessage={"Send"}
                />
              </Button>
            </Tooltip>
            <div style={{ height: "5px" }} />
            <Button
              onClick={() => actions.set_is_preview(true)}
              style={{ height: "47.5px" }}
              disabled={is_preview}
            >
              <FormattedMessage
                id="chatroom.chat_input.preview_button.label"
                defaultMessage={"Preview"}
              />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (messages == null || input == null) {
    return <Loading theme={"medium"} />;
  }
  // remove frameContext once the chatroom is part of a frame tree.
  // we need this now, e.g., since some markdown editing components
  // for input assume in a frame tree, e.g., to fix
  //  https://github.com/sagemathinc/cocalc/issues/7554
  return (
    <FrameContext.Provider
      value={
        {
          project_id,
          path,
          isVisible: !!is_visible,
          redux,
        } as any
      }
    >
      <div
        onMouseMove={mark_as_read}
        onClick={mark_as_read}
        className="smc-vfill"
      >
        {render_body()}
      </div>
    </FrameContext.Provider>
  );
}
