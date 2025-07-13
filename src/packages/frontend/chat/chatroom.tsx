/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Divider, Input, Select, Space, Tooltip } from "antd";
import { debounce } from "lodash";
import { FormattedMessage } from "react-intl";

import { Col, Row, Well } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useEditorRedux,
  useEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { hoursToTimeIntervalHuman } from "@cocalc/util/misc";
import { EditorComponentProps } from "../frame-editors/frame-tree/types";
import { ChatLog } from "./chat-log";
import Filter from "./filter";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import type { ChatState } from "./store";
import { SubmitMentionsFn } from "./types";
import { INPUT_HEIGHT, markChatAsReadIfUnseen } from "./utils";

const FILTER_RECENT_NONE = {
  value: 0,
  label: (
    <>
      <Icon name="clock" />
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

export function ChatRoom({
  actions,
  project_id,
  path,
  font_size,
  desc,
}: EditorComponentProps) {
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  const [input, setInput] = useState("");
  const search = desc?.get("data-search") ?? "";
  const filterRecentH: number = desc?.get("data-filterRecentH") ?? 0;
  const selectedHashtags = desc?.get("data-selectedHashtags");
  const scrollToIndex = desc?.get("data-scrollToIndex") ?? null;
  const scrollToDate = desc?.get("data-scrollToDate") ?? null;
  const fragmentId = desc?.get("data-fragmentId") ?? null;
  const showPreview = desc?.get("data-showPreview") ?? null;
  const costEstimate = desc?.get("data-costEstimate");
  const messages = useEditor("messages");
  const [filterRecentHCustom, setFilterRecentHCustom] = useState<string>("");
  const [filterRecentOpen, setFilterRecentOpen] = useState<boolean>(false);

  const submitMentionsRef = useRef<SubmitMentionsFn | undefined>(undefined);
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

  function render_preview_message(): React.JSX.Element | undefined {
    if (!showPreview) {
      return;
    }
    if (input.length === 0) {
      return;
    }

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
              onClick={() => actions.setShowPreview(false)}
            >
              <Icon name="times" />
            </div>
            <StaticMarkdown value={input} />
            <div className="small lighten" style={{ marginTop: "15px" }}>
              Preview (press Shift+Enter to send)
            </div>
          </Well>
        </Col>

        <Col sm={1} />
      </Row>
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
            actions.setFilterRecentH(0);
            setFilterRecentHCustom("");
          }}
          popupMatchSelectWidth={false}
          onSelect={(val: number) => actions.setFilterRecentH(val)}
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
                      actions.setFilterRecentH(val);
                    } else if (v == "") {
                      actions.setFilterRecentH(FILTER_RECENT_NONE.value);
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
    if (messages == null) {
      return null;
    }
    return (
      <Space style={{ marginTop: "5px", marginLeft: "15px" }} wrap>
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
    scrollToBottomRef.current?.(true);
    actions.sendChat({ submitMentionsRef });
    setTimeout(() => {
      scrollToBottomRef.current?.(true);
    }, 100);
    setInput("");
  }

  function render_body(): React.JSX.Element {
    return (
      <div className="smc-vfill" style={GRID_STYLE}>
        {render_button_row()}
        <div className="smc-vfill" style={CHAT_LOG_STYLE}>
          <ChatLog
            actions={actions}
            project_id={project_id}
            path={path}
            scrollToBottomRef={scrollToBottomRef}
            mode={"standalone"}
            fontSize={font_size}
            search={search}
            filterRecentH={filterRecentH}
            selectedHashtags={selectedHashtags}
            scrollToIndex={scrollToIndex}
            scrollToDate={scrollToDate}
            selectedDate={fragmentId}
            costEstimate={costEstimate}
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
              fontSize={font_size}
              autoFocus
              cacheId={`${path}${project_id}-new`}
              input={input}
              on_send={on_send}
              height={INPUT_HEIGHT}
              onChange={(value) => {
                setInput(value);
                // submitMentionsRef will not actually submit mentions; we're only interested in the reply value
                const input =
                  submitMentionsRef.current?.(undefined, true) ?? value;
                actions?.llmEstimateCost({ date: 0, input });
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
            {costEstimate?.get("date") == 0 && (
              <LLMCostEstimationChat
                costEstimate={costEstimate?.toJS()}
                compact
                style={{
                  flex: 0,
                  fontSize: "85%",
                  textAlign: "center",
                  margin: "0 0 5px 0",
                }}
              />
            )}
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
                disabled={input.trim() === ""}
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
              type={showPreview ? "dashed" : undefined}
              onClick={() => actions.setShowPreview(!showPreview)}
              style={{ height: "47.5px" }}
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
  return (
    <div
      onMouseMove={mark_as_read}
      onClick={mark_as_read}
      className="smc-vfill"
    >
      {render_body()}
    </div>
  );
}
