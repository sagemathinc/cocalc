/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import {
  Button,
  Divider,
  Dropdown,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Switch,
  Tooltip,
  message as antdMessage,
} from "antd";
import { debounce } from "lodash";
import { FormattedMessage } from "react-intl";

import { Col, Row, Well } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useEditorRedux,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { hoursToTimeIntervalHuman } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { EditorComponentProps } from "../frame-editors/frame-tree/types";
import { ChatLog } from "./chat-log";
import Filter from "./filter";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import type { ChatState } from "./store";
import type { ChatMessageTyped, ChatMessages, SubmitMentionsFn } from "./types";
import { INPUT_HEIGHT, markChatAsReadIfUnseen } from "./utils";
import { ALL_THREADS_KEY, useThreadList } from "./threads";

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

const CHAT_LAYOUT_STYLE: React.CSSProperties = {
  height: "100%",
  background: "white",
} as const;

const CHAT_LOG_STYLE: React.CSSProperties = {
  padding: "0",
  background: "white",
  flex: "1 0 auto",
  position: "relative",
  marginBottom: "10px",
} as const;

const THREAD_SIDEBAR_WIDTH = 260;

const THREAD_SIDEBAR_STYLE: React.CSSProperties = {
  background: "#fafafa",
  borderRight: "1px solid #eee",
  padding: "15px 0",
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
} as const;

const THREAD_SIDEBAR_HEADER: React.CSSProperties = {
  padding: "0 20px 10px",
  fontWeight: 600,
  fontSize: "14px",
  textTransform: "uppercase",
  color: "#666",
  display: "flex",
  alignItems: "center",
  gap: "10px",
} as const;

const THREAD_ITEM_LABEL_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginTop: "10px",
  pointerEvents: "none",
} as const;

const THREAD_ITEM_COUNT_STYLE: React.CSSProperties = {
  fontSize: "11px",
  color: "#999",
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
  const messages = useEditor("messages") as ChatMessages | undefined;
  const [filterRecentHCustom, setFilterRecentHCustom] = useState<string>("");
  const [filterRecentOpen, setFilterRecentOpen] = useState<boolean>(false);
  const threads = useThreadList(messages);
  const [selectedThreadKey, setSelectedThreadKey0] = useState<string | null>(
    null,
  );
  const setSelectedThreadKey = (x) => {
    if (x != null && x != ALL_THREADS_KEY) {
      actions.clearAllFilters();
    }
    setSelectedThreadKey0(x);
  };
  const [lastThreadKey, setLastThreadKey] = useState<string | null>(null);
  const [threadTitles, setThreadTitles] = useState<Record<string, string>>({});
  const [renamingThread, setRenamingThread] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [hoveredThread, setHoveredThread] = useState<string | null>(null);
  const [allowAutoSelectThread, setAllowAutoSelectThread] =
    useState<boolean>(true);
  const selectedThreadDate = useMemo(() => {
    if (!selectedThreadKey || selectedThreadKey === ALL_THREADS_KEY) {
      return undefined;
    }
    const millis = parseInt(selectedThreadKey, 10);
    if (!isFinite(millis)) return undefined;
    return new Date(millis);
  }, [selectedThreadKey]);

  const isAllThreadsSelected = selectedThreadKey === ALL_THREADS_KEY;
  const singleThreadView = selectedThreadKey != null && !isAllThreadsSelected;
  const showThreadFilters = isAllThreadsSelected;

  useEffect(() => {
    if (threads.length === 0) {
      if (selectedThreadKey !== null) {
        setSelectedThreadKey(null);
      }
      setAllowAutoSelectThread(true);
      return;
    }
    const exists = threads.some((thread) => thread.key === selectedThreadKey);
    if (!exists && allowAutoSelectThread) {
      setSelectedThreadKey(threads[0].key);
    }
  }, [threads, selectedThreadKey, allowAutoSelectThread]);

  useEffect(() => {
    if (selectedThreadKey != null && selectedThreadKey !== ALL_THREADS_KEY) {
      setLastThreadKey(selectedThreadKey);
    }
  }, [selectedThreadKey]);

  const handleToggleAllChats = (checked: boolean) => {
    if (checked) {
      setAllowAutoSelectThread(false);
      setSelectedThreadKey(ALL_THREADS_KEY);
    } else {
      setAllowAutoSelectThread(true);
      if (lastThreadKey != null) {
        setSelectedThreadKey(lastThreadKey);
      } else if (threads[0]?.key) {
        setSelectedThreadKey(threads[0].key);
      } else {
        setSelectedThreadKey(null);
      }
    }
  };

  const getThreadKeyForMessage = (
    dateKey: string | number,
    message: ChatMessageTyped,
  ): string => {
    const replyTo = message.get("reply_to");
    if (replyTo != null) {
      return `${new Date(replyTo).valueOf()}`;
    }
    return typeof dateKey === "string" ? dateKey : `${dateKey}`;
  };

  const performDeleteThread = (threadKey: string) => {
    if (messages == null || actions == null) {
      return;
    }
    const toDelete: ChatMessageTyped[] = [];
    for (const [time, message] of messages) {
      if (message == null) continue;
      const rootKey = getThreadKeyForMessage(time, message);
      if (rootKey === threadKey) {
        toDelete.push(message);
      }
    }
    if (toDelete.length === 0) {
      antdMessage.info("This chat has no messages to delete.");
      return;
    }
    for (const message of toDelete) {
      actions.sendEdit(message, "");
    }
    setThreadTitles((prev) => {
      const next = { ...prev };
      delete next[threadKey];
      return next;
    });
    if (selectedThreadKey === threadKey) {
      setSelectedThreadKey(null);
    }
    antdMessage.success("Chat deleted.");
  };

  const confirmDeleteThread = (threadKey: string) => {
    Modal.confirm({
      title: "Delete chat?",
      content:
        "This removes all messages in this chat for everyone. This can only be undone using 'Edit --> Undo'",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => performDeleteThread(threadKey),
    });
  };

  const openRenameModal = (threadKey: string, currentLabel: string) => {
    setRenamingThread(threadKey);
    setRenameValue(currentLabel);
  };

  const closeRenameModal = () => {
    setRenamingThread(null);
    setRenameValue("");
  };

  const handleRenameSave = () => {
    if (!renamingThread) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      antdMessage.error("Chat name cannot be empty.");
      return;
    }
    setThreadTitles((prev) => ({
      ...prev,
      [renamingThread]: trimmed,
    }));
    closeRenameModal();
  };

  const threadMenuProps = (
    threadKey: string,
    displayLabel: string,
  ): MenuProps => ({
    items: [
      {
        key: "rename",
        label: "Rename chat",
      },
      {
        type: "divider",
      },
      {
        key: "delete",
        label: <span style={{ color: COLORS.ANTD_RED }}>Delete chat</span>,
      },
    ],
    onClick: ({ key }) => {
      if (key === "rename") {
        openRenameModal(threadKey, displayLabel);
      } else if (key === "delete") {
        confirmDeleteThread(threadKey);
      }
    },
  });

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
    sendMessage();
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
    if (messages == null || messages.size <= 5) {
      return null;
    }
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
    if (!showThreadFilters) {
      return null;
    }
    if (messages == null || messages.size <= 5) {
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
          }}
        />
        {renderFilterRecent()}
      </Space>
    );
  }

  function sendMessage(replyToOverride?: Date | null): void {
    const reply_to =
      replyToOverride === undefined
        ? selectedThreadDate
        : (replyToOverride ?? undefined);
    if (!reply_to) {
      setAllowAutoSelectThread(true);
    }
    scrollToBottomRef.current?.(true);
    const timeStamp = actions.sendChat({ submitMentionsRef, reply_to });
    if (!reply_to && timeStamp) {
      setSelectedThreadKey(timeStamp);
      setTimeout(() => {
        setSelectedThreadKey(timeStamp);
      }, 100);
    }
    setTimeout(() => {
      scrollToBottomRef.current?.(true);
    }, 100);
    actions.deleteDraft(0);
    setInput("");
  }
  function on_send(): void {
    sendMessage();
  }

  function renderThreadSidebar(): React.JSX.Element {
    const menuItems =
      threads.length === 0
        ? []
        : threads.map(({ key, label, messageCount }) => {
            const displayLabel = threadTitles[key] ?? label;
            const isHovered = hoveredThread === key;
            const showMenu = isHovered || selectedThreadKey === key;
            return {
              key,
              label: (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                  onMouseEnter={() => setHoveredThread(key)}
                  onMouseLeave={() =>
                    setHoveredThread((prev) => (prev === key ? null : prev))
                  }
                >
                  <StaticMarkdown
                    value={displayLabel}
                    style={THREAD_ITEM_LABEL_STYLE}
                  />
                  <span style={THREAD_ITEM_COUNT_STYLE}>{messageCount}</span>
                  {showMenu && (
                    <Dropdown
                      menu={threadMenuProps(key, displayLabel)}
                      trigger={["click"]}
                    >
                      <Button
                        type="text"
                        size="small"
                        onClick={(event) => event.stopPropagation()}
                        icon={<Icon name="ellipsis" />}
                      />
                    </Dropdown>
                  )}
                </div>
              ),
            };
          });

    return (
      <Layout.Sider width={THREAD_SIDEBAR_WIDTH} style={THREAD_SIDEBAR_STYLE}>
        <div style={THREAD_SIDEBAR_HEADER}>
          <span style={{ flex: 1 }}>Chats</span>
          <Space size="small">
            <Switch
              unCheckedChildren="All"
              checkedChildren=""
              size="small"
              checked={isAllThreadsSelected}
              onChange={handleToggleAllChats}
            />
          </Space>
          <Button
            size="small"
            type={!selectedThreadKey ? "primary" : "default"}
            onClick={() => {
              setAllowAutoSelectThread(false);
              setSelectedThreadKey(null);
            }}
          >
            New Chat
          </Button>
        </div>
        {threads.length === 0 ? (
          <div style={{ padding: "0 20px", color: "#888", fontSize: "13px" }}>
            No messages yet.
          </div>
        ) : (
          <Menu
            mode="inline"
            selectedKeys={selectedThreadKey ? [selectedThreadKey] : []}
            onClick={({ key }) => {
              setAllowAutoSelectThread(true);
              setSelectedThreadKey(String(key));
            }}
            items={menuItems}
          />
        )}
      </Layout.Sider>
    );
  }

  function render_body(): React.JSX.Element {
    return (
      <Layout style={CHAT_LAYOUT_STYLE}>
        {renderThreadSidebar()}
        <Layout.Content className="smc-vfill" style={{ background: "white" }}>
          <div className="smc-vfill" style={GRID_STYLE}>
            {render_button_row()}
            {selectedThreadKey ? (
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
                  selectedThread={
                    singleThreadView ? selectedThreadKey : undefined
                  }
                  scrollToIndex={scrollToIndex}
                  scrollToDate={scrollToDate}
                  selectedDate={fragmentId}
                  costEstimate={costEstimate}
                />
                {render_preview_message()}
              </div>
            ) : (
              <div
                className="smc-vfill"
                style={{
                  ...CHAT_LOG_STYLE,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#888",
                  fontSize: "14px",
                }}
              >
                <div>
                  Select a chat on the left or start a{" "}
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      setAllowAutoSelectThread(false);
                      setSelectedThreadKey(null);
                    }}
                  >
                    new conversation
                  </Button>
                  .
                </div>
              </div>
            )}
            <div
              style={{ display: "flex", marginBottom: "5px", overflow: "auto" }}
            >
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
                <div style={{ height: "5px" }} />
                <Button
                  style={{ height: "47.5px" }}
                  onClick={() => {
                    actions?.frameTreeActions?.getVideoChat().startChatting();
                  }}
                >
                  <Icon name="video-camera" /> Video
                </Button>
              </div>
            </div>
          </div>
        </Layout.Content>
      </Layout>
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
      <Modal
        title="Rename chat"
        open={renamingThread != null}
        onCancel={closeRenameModal}
        onOk={handleRenameSave}
        okText="Save"
        destroyOnClose
      >
        <Input
          placeholder="Chat name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameSave}
          allowClear
          autoFocus
        />
      </Modal>
    </div>
  );
}
