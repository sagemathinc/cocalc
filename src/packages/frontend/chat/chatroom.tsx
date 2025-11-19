/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import {
  Badge,
  Button,
  Divider,
  Drawer,
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
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { hoursToTimeIntervalHuman } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { NodeDesc } from "../frame-editors/frame-tree/types";
import { EditorComponentProps } from "../frame-editors/frame-tree/types";
import type { ChatActions } from "./actions";
import { ChatLog } from "./chat-log";
import Filter from "./filter";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import type { ChatState } from "./store";
import type { ChatMessageTyped, ChatMessages, SubmitMentionsFn } from "./types";
import {
  INPUT_HEIGHT,
  getThreadRootDate,
  markChatAsReadIfUnseen,
} from "./utils";
import { ALL_THREADS_KEY, useThreadList } from "./threads";
import type { ThreadListItem } from "./threads";

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
  padding: "0 20px 15px",
  color: "#666",
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

export type ThreadMeta = ThreadListItem & {
  displayLabel: string;
  hasCustomName: boolean;
  readCount: number;
  unreadCount: number;
  isAI: boolean;
};

export interface ChatPanelProps {
  actions: ChatActions;
  project_id: string;
  path: string;
  messages?: ChatMessages;
  fontSize?: number;
  desc?: NodeDesc;
  variant?: "default" | "compact";
  disableFilters?: boolean;
}

function getDescValue(desc: NodeDesc | undefined, key: string) {
  if (desc == null) return undefined;
  const getter: any = (desc as any).get;
  if (typeof getter === "function") {
    return getter.call(desc, key);
  }
  return (desc as any)[key];
}

export function ChatPanel({
  actions,
  project_id,
  path,
  messages,
  fontSize = 13,
  desc,
  variant = "default",
  disableFilters: disableFiltersProp,
}: ChatPanelProps) {
  const account_id = useTypedRedux("account", "account_id");
  const [input, setInput] = useState("");
  const search = getDescValue(desc, "data-search") ?? "";
  const filterRecentH: number = getDescValue(desc, "data-filterRecentH") ?? 0;
  const selectedHashtags = getDescValue(desc, "data-selectedHashtags");
  const scrollToIndex = getDescValue(desc, "data-scrollToIndex") ?? null;
  const scrollToDate = getDescValue(desc, "data-scrollToDate") ?? null;
  const fragmentId = getDescValue(desc, "data-fragmentId") ?? null;
  const showPreview = getDescValue(desc, "data-showPreview") ?? null;
  const costEstimate = getDescValue(desc, "data-costEstimate");
  const [filterRecentHCustom, setFilterRecentHCustom] = useState<string>("");
  const [filterRecentOpen, setFilterRecentOpen] = useState<boolean>(false);
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(false);
  const isCompact = variant === "compact";
  const disableFilters = disableFiltersProp ?? isCompact;
  const [selectedThreadKey, setSelectedThreadKey0] = useState<string | null>(
    getDescValue(desc, "data-selectedThreadKey") ?? null,
  );
  const setSelectedThreadKey = (x: string | null) => {
    if (x != null && x != ALL_THREADS_KEY) {
      actions.clearAllFilters();
      actions.setFragment();
    }
    setSelectedThreadKey0(x);
    actions.setSelectedThread?.(x);
  };
  const [lastThreadKey, setLastThreadKey] = useState<string | null>(null);
  const [renamingThread, setRenamingThread] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [hoveredThread, setHoveredThread] = useState<string | null>(null);
  const [allowAutoSelectThread, setAllowAutoSelectThread] =
    useState<boolean>(true);
  const submitMentionsRef = useRef<SubmitMentionsFn | undefined>(undefined);
  const scrollToBottomRef = useRef<any>(null);
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
  const showThreadFilters = !isCompact && isAllThreadsSelected;

  const llmCacheRef = useRef<Map<string, boolean>>(new Map());
  const rawThreads = useThreadList(messages);
  const threads = useMemo<ThreadMeta[]>(() => {
    return rawThreads.map((thread) => {
      const rootMessage = thread.rootMessage;
      const storedName = (
        rootMessage?.get("name") as string | undefined
      )?.trim();
      const hasCustomName = !!storedName;
      const displayLabel = storedName || thread.label;
      const readField =
        account_id && rootMessage
          ? rootMessage.get(`read-${account_id}`)
          : null;
      const readValue =
        typeof readField === "number"
          ? readField
          : typeof readField === "string"
            ? parseInt(readField, 10)
            : 0;
      const readCount =
        Number.isFinite(readValue) && readValue > 0 ? readValue : 0;
      const unreadCount = Math.max(thread.messageCount - readCount, 0);
      let isAI = llmCacheRef.current.get(thread.key);
      if (isAI == null) {
        if (actions?.isLanguageModelThread) {
          const result = actions.isLanguageModelThread(
            new Date(parseInt(thread.key, 10)),
          );
          isAI = result !== false;
        } else {
          isAI = false;
        }
        llmCacheRef.current.set(thread.key, isAI);
      }
      return {
        ...thread,
        displayLabel,
        hasCustomName,
        readCount,
        unreadCount,
        isAI: !!isAI,
      };
    });
  }, [rawThreads, account_id, actions]);

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

  useEffect(() => {
    if (!fragmentId || isAllThreadsSelected || messages == null) {
      return;
    }
    const parsed = parseFloat(fragmentId);
    if (!isFinite(parsed)) {
      return;
    }
    const keyStr = `${parsed}`;
    let message = messages.get(keyStr) as ChatMessageTyped | undefined;
    if (message == null) {
      for (const [, msg] of messages) {
        const dateField = msg?.get("date");
        if (
          dateField != null &&
          typeof dateField.valueOf === "function" &&
          dateField.valueOf() === parsed
        ) {
          message = msg;
          break;
        }
      }
    }
    if (message == null) return;
    const root = getThreadRootDate({ date: parsed, messages }) || parsed;
    const threadKey = `${root}`;
    if (threadKey !== selectedThreadKey) {
      setAllowAutoSelectThread(false);
      setSelectedThreadKey(threadKey);
    }
  }, [fragmentId, isAllThreadsSelected, messages, selectedThreadKey]);

  const mark_as_read = () => markChatAsReadIfUnseen(project_id, path);

  useEffect(() => {
    if (!singleThreadView || !selectedThreadKey) {
      return;
    }
    const thread = threads.find((t) => t.key === selectedThreadKey);
    if (!thread) {
      return;
    }
    if (thread.unreadCount <= 0) {
      return;
    }
    actions.markThreadRead?.(thread.key, thread.messageCount);
  }, [singleThreadView, selectedThreadKey, threads, actions]);

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

  const performDeleteThread = (threadKey: string) => {
    if (actions?.deleteThread == null) {
      antdMessage.error("Deleting chats is not available.");
      return;
    }
    const deleted = actions.deleteThread(threadKey);
    if (deleted === 0) {
      antdMessage.info("This chat has no messages to delete.");
      return;
    }
    if (selectedThreadKey === threadKey) {
      setSelectedThreadKey(null);
    }
    antdMessage.success("Chat deleted.");
  };

  const confirmDeleteThread = (threadKey: string) => {
    Modal.confirm({
      title: "Delete chat?",
      content:
        "This removes all messages in this chat for everyone. This can only be undone using 'Edit --> Undo', or by browsing TimeTravel.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => performDeleteThread(threadKey),
    });
  };

  const openRenameModal = (
    threadKey: string,
    currentLabel: string,
    useCurrentLabel: boolean,
  ) => {
    setRenamingThread(threadKey);
    setRenameValue(useCurrentLabel ? currentLabel : "");
  };

  const closeRenameModal = () => {
    setRenamingThread(null);
    setRenameValue("");
  };

  const handleRenameSave = () => {
    if (!renamingThread) return;
    if (actions?.renameThread == null) {
      antdMessage.error("Renaming chats is not available.");
      return;
    }
    const success = actions.renameThread(renamingThread, renameValue.trim());
    if (!success) {
      antdMessage.error("Unable to rename chat.");
      return;
    }
    antdMessage.success(
      renameValue.trim() ? "Chat renamed." : "Chat name reset to default.",
    );
    closeRenameModal();
  };

  const threadMenuProps = (
    threadKey: string,
    displayLabel: string,
    hasCustomName: boolean,
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
        openRenameModal(threadKey, displayLabel, hasCustomName);
      } else if (key === "delete") {
        confirmDeleteThread(threadKey);
      }
    },
  });

  const renderThreadRow = (thread: ThreadMeta) => {
    const { key, displayLabel, hasCustomName, unreadCount, isAI } = thread;
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
          <Icon name={isAI ? "robot" : "users"} style={{ color: "#888" }} />
          <StaticMarkdown
            value={displayLabel}
            style={THREAD_ITEM_LABEL_STYLE}
          />
          {unreadCount > 0 && (
            <Badge
              count={unreadCount}
              size="small"
              overflowCount={99}
              style={{
                backgroundColor: COLORS.GRAY_L0,
                color: COLORS.GRAY_D,
              }}
            />
          )}
          {showMenu && (
            <Dropdown
              menu={threadMenuProps(key, displayLabel, hasCustomName)}
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
  };

  const renderThreadSection = (
    title: string,
    icon: "users" | "robot",
    list: ThreadMeta[],
  ) => {
    const unreadTotal = list.reduce(
      (sum, thread) => sum + thread.unreadCount,
      0,
    );
    const items = list.map(renderThreadRow);
    return (
      <div style={{ marginBottom: "15px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name={icon} />
            <span style={{ fontWeight: 600 }}>{title}</span>
          </div>
          {unreadTotal > 0 && (
            <Badge
              count={unreadTotal}
              size="small"
              style={{
                backgroundColor: COLORS.GRAY_L0,
                color: COLORS.GRAY_D,
              }}
            />
          )}
        </div>
        {list.length === 0 ? (
          <div style={{ color: "#999", fontSize: "12px", marginLeft: "4px" }}>
            No chats
          </div>
        ) : (
          <Menu
            mode="inline"
            selectedKeys={selectedThreadKey ? [selectedThreadKey] : []}
            onClick={({ key }) => {
              setAllowAutoSelectThread(true);
              setSelectedThreadKey(String(key));
              if (isCompact) {
                setSidebarVisible(false);
              }
            }}
            items={items}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              maxHeight: "28vh",
              overflowY: "auto",
            }}
          />
        )}
      </div>
    );
  };

  const humanThreads = useMemo(
    () => threads.filter((thread) => !thread.isAI),
    [threads],
  );
  const aiThreads = useMemo(
    () => threads.filter((thread) => thread.isAI),
    [threads],
  );
  const totalUnread = useMemo(
    () => threads.reduce((sum, thread) => sum + thread.unreadCount, 0),
    [threads],
  );

  const renderSidebarContent = () => (
    <>
      <div style={THREAD_SIDEBAR_HEADER}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "15px",
              textTransform: "uppercase",
            }}
          >
            Chats
          </span>
          {!isCompact && (
            <Space size="small">
              <span style={{ fontSize: "12px" }}>All</span>
              <Switch
                size="small"
                checked={isAllThreadsSelected}
                onChange={handleToggleAllChats}
              />
            </Space>
          )}
        </div>
        {!isCompact && (
          <>
            <Button
              block
              type={!selectedThreadKey ? "primary" : "default"}
              onClick={() => {
                setAllowAutoSelectThread(false);
                setSelectedThreadKey(null);
              }}
            >
              New Chat
            </Button>
            <Button
              block
              style={{ marginTop: "8px" }}
              onClick={() => {
                actions?.frameTreeActions?.show_search();
              }}
            >
              Search
            </Button>
          </>
        )}
      </div>
      {renderThreadSection("Humans", "users", humanThreads)}
      {renderThreadSection("AI", "robot", aiThreads)}
    </>
  );

  function isValidFilterRecentCustom(): boolean {
    const v = parseFloat(filterRecentHCustom);
    return isFinite(v) && v >= 0;
  }

  function renderFilterRecent() {
    if (messages == null || messages.size <= 5) {
      return null;
    }
    if (disableFilters) {
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
    if (!showThreadFilters || disableFilters) {
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

  function sendMessage(
    replyToOverride?: Date | null,
    extraInput?: string,
  ): void {
    const reply_to =
      replyToOverride === undefined
        ? selectedThreadDate
        : (replyToOverride ?? undefined);
    if (!reply_to) {
      setAllowAutoSelectThread(true);
    }
    const timeStamp = actions.sendChat({
      submitMentionsRef,
      reply_to,
      extraInput,
    });
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

  const renderThreadSidebar = () => (
    <Layout.Sider width={THREAD_SIDEBAR_WIDTH} style={THREAD_SIDEBAR_STYLE}>
      {renderSidebarContent()}
    </Layout.Sider>
  );

  const renderChatContent = () => (
    <div className="smc-vfill" style={GRID_STYLE}>
      {render_button_row()}
      {selectedThreadKey ? (
        <div className="smc-vfill" style={CHAT_LOG_STYLE}>
          <ChatLog
            actions={actions}
            project_id={project_id}
            path={path}
            scrollToBottomRef={scrollToBottomRef}
            mode={variant === "compact" ? "sidechat" : "standalone"}
            fontSize={fontSize}
            search={search}
            filterRecentH={filterRecentH}
            selectedHashtags={selectedHashtags}
            selectedThread={
              singleThreadView ? (selectedThreadKey ?? undefined) : undefined
            }
            scrollToIndex={scrollToIndex}
            scrollToDate={scrollToDate}
            selectedDate={fragmentId}
            costEstimate={costEstimate}
          />
          {showPreview && input.length > 0 && (
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
          )}
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
          <div style={{ textAlign: "center" }}>
            {threads.length === 0
              ? "No chats yet. Start a new conversation."
              : "Select a chat or start a new conversation."}
            <Button
              size="small"
              type="primary"
              style={{ marginLeft: "8px" }}
              onClick={() => {
                setAllowAutoSelectThread(false);
                setSelectedThreadKey(null);
              }}
            >
              New Chat
            </Button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", marginBottom: "5px", overflow: "auto" }}>
        <div
          style={{
            flex: "1",
            padding: "0px 5px 0px 2px",
          }}
        >
          <ChatInput
            fontSize={fontSize}
            autoFocus
            cacheId={`${path}${project_id}-new`}
            input={input}
            on_send={on_send}
            height={INPUT_HEIGHT}
            onChange={(value) => {
              setInput(value);
              const inputText =
                submitMentionsRef.current?.(undefined, true) ?? value;
              actions?.llmEstimateCost({ date: 0, input: inputText });
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
              onClick={() => sendMessage()}
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
              const message = actions?.frameTreeActions
                ?.getVideoChat()
                .startChatting(actions);
              if (!message) {
                return;
              }
              console.log("start video chat returned", { message });
              sendMessage(undefined, "\n\n" + message);
            }}
          >
            <Icon name="video-camera" /> Video
          </Button>
        </div>
      </div>
    </div>
  );

  const renderDefaultLayout = () => (
    <Layout style={CHAT_LAYOUT_STYLE}>
      {renderThreadSidebar()}
      <Layout.Content className="smc-vfill" style={{ background: "white" }}>
        {renderChatContent()}
      </Layout.Content>
    </Layout>
  );

  const renderCompactLayout = () => (
    <div className="smc-vfill" style={{ background: "white" }}>
      <Drawer
        open={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        placement="right"
        width={THREAD_SIDEBAR_WIDTH + 40}
        title="Chats"
        destroyOnClose
      >
        {renderSidebarContent()}
      </Drawer>
      <div
        style={{
          padding: "10px",
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
        }}
      >
        <Button
          icon={<Icon name="bars" />}
          onClick={() => setSidebarVisible(true)}
        >
          Chats
          <Badge
            count={totalUnread}
            overflowCount={99}
            style={{
              backgroundColor: COLORS.GRAY_L0,
              color: COLORS.GRAY_D,
            }}
          />
        </Button>
        <Button
          type={!selectedThreadKey ? "primary" : "default"}
          onClick={() => {
            setAllowAutoSelectThread(false);
            setSelectedThreadKey(null);
          }}
        >
          New Chat
        </Button>
      </div>
      {renderChatContent()}
    </div>
  );

  if (messages == null) {
    return <Loading theme={"medium"} />;
  }

  return (
    <div
      onMouseMove={mark_as_read}
      onClick={mark_as_read}
      className="smc-vfill"
    >
      {variant === "compact" ? renderCompactLayout() : renderDefaultLayout()}
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
        />
      </Modal>
    </div>
  );
}

export function ChatRoom({
  actions,
  project_id,
  path,
  font_size,
  desc,
}: EditorComponentProps) {
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  const messages = useEditor("messages") as ChatMessages | undefined;
  return (
    <ChatPanel
      actions={actions}
      project_id={project_id}
      path={path}
      messages={messages}
      fontSize={font_size}
      desc={desc}
      variant="default"
    />
  );
}
