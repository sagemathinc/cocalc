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
  Popconfirm,
  Select,
  Space,
  Switch,
  Tooltip,
  message as antdMessage,
} from "antd";
import { debounce } from "lodash";
import { FormattedMessage } from "react-intl";
import { IS_MOBILE } from "@cocalc/frontend/feature";
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
import {
  ALL_THREADS_KEY,
  groupThreadsByRecency,
  useThreadList,
} from "./threads";
import type { ThreadListItem, ThreadSection } from "./threads";
import CodexConfigButton from "./codex";

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
  pointerEvents: "none",
} as const;

const THREAD_SECTION_HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 20px 6px",
  color: COLORS.GRAY_D,
} as const;

export type ThreadMeta = ThreadListItem & {
  displayLabel: string;
  hasCustomName: boolean;
  readCount: number;
  unreadCount: number;
  isAI: boolean;
  isPinned: boolean;
};

function stripHtml(value: string): string {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "");
}

interface ThreadSectionWithUnread extends ThreadSection<ThreadMeta> {
  unreadCount: number;
}

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
  if (IS_MOBILE) {
    variant = "compact";
  }
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
  const storedThreadFromDesc =
    getDescValue(desc, "data-selectedThreadKey") ?? null;
  const [selectedThreadKey, setSelectedThreadKey0] = useState<string | null>(
    storedThreadFromDesc,
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
  const [openThreadMenuKey, setOpenThreadMenuKey] = useState<string | null>(
    null,
  );
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
      const pinValue = rootMessage?.get("pin");
      const isPinned =
        pinValue === true ||
        pinValue === "true" ||
        pinValue === 1 ||
        pinValue === "1";
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
        isPinned,
      };
    });
  }, [rawThreads, account_id, actions]);

  const threadSections = useMemo<ThreadSectionWithUnread[]>(() => {
    const grouped = groupThreadsByRecency(threads);
    return grouped.map((section) => ({
      ...section,
      unreadCount: section.threads.reduce(
        (sum, thread) => sum + thread.unreadCount,
        0,
      ),
    }));
  }, [threads]);

  const selectedThread = React.useMemo(
    () => threads.find((t) => t.key === selectedThreadKey),
    [threads, selectedThreadKey],
  );

  useEffect(() => {
    if (
      storedThreadFromDesc != null &&
      storedThreadFromDesc !== selectedThreadKey
    ) {
      setSelectedThreadKey(storedThreadFromDesc);
      setAllowAutoSelectThread(false);
    }
  }, [storedThreadFromDesc]);

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
    isPinned: boolean,
  ): MenuProps => ({
    items: [
      {
        key: "rename",
        label: "Rename chat",
      },
      {
        key: isPinned ? "unpin" : "pin",
        label: isPinned ? "Unpin chat" : "Pin chat",
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
      } else if (key === "pin" || key === "unpin") {
        if (!actions?.setThreadPin) {
          antdMessage.error("Pinning chats is not available.");
          return;
        }
        const pinned = key === "pin";
        const success = actions.setThreadPin(threadKey, pinned);
        if (!success) {
          antdMessage.error("Unable to update chat pin state.");
          return;
        }
        antdMessage.success(pinned ? "Chat pinned." : "Chat unpinned.");
      } else if (key === "delete") {
        confirmDeleteThread(threadKey);
      }
    },
  });

  const renderThreadRow = (thread: ThreadMeta) => {
    const { key, displayLabel, hasCustomName, unreadCount, isAI, isPinned } =
      thread;
    const plainLabel = stripHtml(displayLabel);
    const isHovered = hoveredThread === key;
    const isMenuOpen = openThreadMenuKey === key;
    const showMenu = isHovered || selectedThreadKey === key || isMenuOpen;
    const iconTooltip = thread.isAI
      ? "This thread started with an AI request, so the AI responds automatically."
      : "This thread started as human-only. AI replies only when explicitly mentioned.";
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
          <Tooltip title={iconTooltip}>
            <Icon name={isAI ? "robot" : "users"} style={{ color: "#888" }} />
          </Tooltip>
          <div style={THREAD_ITEM_LABEL_STYLE}>{plainLabel}</div>
          {unreadCount > 0 && !isHovered && (
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
              menu={threadMenuProps(key, plainLabel, hasCustomName, isPinned)}
              trigger={["click"]}
              open={openThreadMenuKey === key}
              onOpenChange={(open) => {
                setOpenThreadMenuKey(open ? key : null);
                if (!open) {
                  setHoveredThread((prev) => (prev === key ? null : prev));
                }
              }}
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

  const renderUnreadBadge = (
    count: number,
    section: ThreadSectionWithUnread,
  ) => {
    if (count <= 0) {
      return null;
    }
    const badge = (
      <Badge
        count={count}
        size="small"
        style={{
          backgroundColor: COLORS.GRAY_L0,
          color: COLORS.GRAY_D,
        }}
      />
    );
    if (!actions?.markThreadRead) {
      return badge;
    }
    return (
      <Popconfirm
        title="Mark all read?"
        description="Mark every chat in this section as read."
        okText="Mark read"
        cancelText="Cancel"
        placement="left"
        onConfirm={(e) => {
          e?.stopPropagation?.();
          handleMarkSectionRead(section);
        }}
      >
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "pointer", display: "inline-flex" }}
        >
          {badge}
        </span>
      </Popconfirm>
    );
  };

  const renderThreadSection = (section: ThreadSectionWithUnread) => {
    const { title, threads: list, unreadCount, key } = section;
    if (!list || list.length === 0) {
      return null;
    }
    const items = list.map(renderThreadRow);
    return (
      <div key={key} style={{ marginBottom: "18px" }}>
        <div style={THREAD_SECTION_HEADER_STYLE}>
          <span style={{ fontWeight: 600 }}>{title}</span>
          {renderUnreadBadge(unreadCount, section)}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedThreadKey ? [selectedThreadKey] : []}
          onClick={({ key: menuKey }) => {
            setAllowAutoSelectThread(true);
            setSelectedThreadKey(String(menuKey));
            if (isCompact) {
              setSidebarVisible(false);
            }
          }}
          items={items}
          style={{
            border: "none",
            background: "transparent",
            padding: "0 10px",
          }}
        />
      </div>
    );
  };

  const totalUnread = useMemo(
    () => threadSections.reduce((sum, section) => sum + section.unreadCount, 0),
    [threadSections],
  );

  const handleMarkSectionRead = (section: ThreadSectionWithUnread): void => {
    if (!actions?.markThreadRead) return;
    const v: { key: string; messageCount: number }[] = [];
    for (const thread of section.threads) {
      if (thread.unreadCount > 0) {
        v.push({ key: thread.key, messageCount: thread.messageCount });
      }
    }
    for (let i = 0; i < v.length; i++) {
      const { key, messageCount } = v[i];
      actions.markThreadRead(key, messageCount, i == v.length - 1);
    }
  };

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
      {threadSections.length === 0 ? (
        <div style={{ color: "#999", fontSize: "12px", padding: "0 20px" }}>
          No chats yet.
        </div>
      ) : (
        threadSections.map((section) => renderThreadSection(section))
      )}
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
        <div
          className="smc-vfill"
          style={{ ...CHAT_LOG_STYLE, position: "relative" }}
        >
          {selectedThread?.rootMessage &&
            actions?.isCodexThread(
              new Date(parseInt(selectedThread.key, 10)),
            ) && (
              <div
                style={{ position: "absolute", top: 8, right: 16, zIndex: 10 }}
              >
                <CodexConfigButton
                  threadKey={selectedThread.key}
                  chatPath={path}
                  actions={actions}
                />
              </div>
            )}
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
