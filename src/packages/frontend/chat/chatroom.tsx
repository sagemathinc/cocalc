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
  Checkbox,
  Select,
  Space,
  Switch,
  Tooltip,
  message as antdMessage,
} from "antd";
import { debounce } from "lodash";
import { FormattedMessage } from "react-intl";
import { IS_MOBILE } from "@cocalc/frontend/feature";
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
import { CONTEXT_WARN_PCT, CONTEXT_CRITICAL_PCT } from "./codex";
import { Resizable } from "re-resizable";

const FILTER_RECENT_NONE = {
  value: 0,
  label: (
    <>
      <Icon name="clock" />
    </>
  ),
} as const;

const GRID_STYLE: React.CSSProperties = {
  maxWidth: "1200px",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  margin: "auto",
  minHeight: 0,
  flex: 1,
} as const;

const CHAT_LAYOUT_STYLE: React.CSSProperties = {
  height: "100%",
  background: "white",
} as const;

const CHAT_LOG_STYLE: React.CSSProperties = {
  padding: "0",
  background: "white",
  flex: "1 1 0",
  minHeight: 0,
  position: "relative",
} as const;

const DEFAULT_SIDEBAR_WIDTH = 260;

const THREAD_SIDEBAR_STYLE: React.CSSProperties = {
  background: "#fafafa",
  borderRight: "1px solid #eee",
  padding: "15px 0",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  height: "100%",
  minHeight: 0,
  transition: "none",
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
  lastActivityAt?: number;
  contextRemaining?: number;
};

const ACTIVITY_RECENT_MS = 7_500;

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
  activity?: any;
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
  activity,
  fontSize = 13,
  desc,
  variant = "default",
  disableFilters: disableFiltersProp,
}: ChatPanelProps) {
  const account_id = useTypedRedux("account", "account_id");
  if (IS_MOBILE) {
    variant = "compact";
  }
  const [input, setInput] = useState("");
  const search = getDescValue(desc, "data-search") ?? "";
  const filterRecentH: number = getDescValue(desc, "data-filterRecentH") ?? 0;
  const selectedHashtags = getDescValue(desc, "data-selectedHashtags");
  const scrollToIndex = getDescValue(desc, "data-scrollToIndex") ?? null;
  const scrollToDate = getDescValue(desc, "data-scrollToDate") ?? null;
  const fragmentId = getDescValue(desc, "data-fragmentId") ?? null;
  const costEstimate = getDescValue(desc, "data-costEstimate");
  const storedSidebarWidth = getDescValue(desc, "data-sidebarWidth");
  const storedSidebarCollapsed = getDescValue(desc, "data-sidebarCollapsed");
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    typeof storedSidebarWidth === "number" && storedSidebarWidth > 50
      ? storedSidebarWidth
      : DEFAULT_SIDEBAR_WIDTH,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    !!storedSidebarCollapsed,
  );
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
  const [exportThread, setExportThread] = useState<{
    key: string;
    label: string;
    isAI: boolean;
  } | null>(null);
  const [exportFilename, setExportFilename] = useState<string>("");
  const [exportIncludeLogs, setExportIncludeLogs] =
    useState<boolean>(false);
  const [allowAutoSelectThread, setAllowAutoSelectThread] =
    useState<boolean>(true);
  const [activityNow, setActivityNow] = useState<number>(Date.now());
  const submitMentionsRef = useRef<SubmitMentionsFn | undefined>(undefined);
  const scrollToBottomRef = useRef<any>(null);
  const lastScrollRequestRef = useRef<{
    thread: string;
    reason: "unread" | "allread";
  } | null>(null);
  const visitedThreadsRef = useRef<Set<string>>(new Set());
  const unreadSeenRef = useRef<Map<string, number>>(new Map());
  const scrollCacheId = useMemo(() => {
    const base = `${project_id ?? ""}${path ?? ""}`;
    return `${base}-${selectedThreadKey ?? "all"}`;
  }, [project_id, path, selectedThreadKey]);

  useEffect(() => {
    if (IS_MOBILE && sidebarWidth !== DEFAULT_SIDEBAR_WIDTH) {
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (!actions?.frameTreeActions?.set_frame_data || !actions?.frameId) return;
    actions.frameTreeActions.set_frame_data({
      id: actions.frameId,
      sidebarWidth,
    });
  }, [sidebarWidth, actions?.frameTreeActions, actions?.frameId]);

  useEffect(() => {
    if (!actions?.frameTreeActions?.set_frame_data || !actions?.frameId) return;
    actions.frameTreeActions.set_frame_data({
      id: actions.frameId,
      sidebarCollapsed,
    });
  }, [sidebarCollapsed, actions?.frameTreeActions, actions?.frameId]);

  useEffect(() => {
    if (!exportThread) return;
    const defaultPath = buildThreadExportPath(
      path,
      exportThread.key,
      exportThread.label,
    );
    setExportFilename(defaultPath);
    setExportIncludeLogs(false);
  }, [exportThread, path]);

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
  const composerDraftKey = useMemo(() => {
    if (
      singleThreadView &&
      selectedThreadDate instanceof Date &&
      !isNaN(selectedThreadDate.valueOf())
    ) {
      return -selectedThreadDate.valueOf();
    }
    return 0;
  }, [singleThreadView, selectedThreadDate]);
  const showThreadFilters = !isCompact && isAllThreadsSelected;

  useEffect(() => {
    if (!actions?.syncdb || !account_id) return;
    const fetchDraft = (date: number) =>
      actions.syncdb
        ?.get_one({
          event: "draft",
          sender_id: account_id,
          date,
        })
        ?.get?.("input") ?? "";
    let nextInput = fetchDraft(composerDraftKey);
    setInput(nextInput);
  }, [actions?.syncdb, account_id, composerDraftKey]);

  const llmCacheRef = useRef<Map<string, boolean>>(new Map());
  const rawThreads = useThreadList(messages);
  const contextRemainingByThread = useMemo(() => {
    const result = new Map<string, number>();
    if (!messages) return result;
    for (const thread of rawThreads) {
      const pct = computeThreadContextRemaining(thread.key, actions, messages);
      if (pct != null) {
        result.set(thread.key, pct);
      }
    }
    return result;
  }, [rawThreads, actions, messages]);
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
      const lastActivityAt =
        activity && typeof (activity as any).get === "function"
          ? (activity as any).get(thread.key)
          : undefined;
      return {
        ...thread,
        displayLabel,
        hasCustomName,
        readCount,
        unreadCount,
        isAI: !!isAI,
        isPinned,
        lastActivityAt:
          typeof lastActivityAt === "number" ? lastActivityAt : undefined,
        contextRemaining: contextRemainingByThread.get(thread.key),
      };
    });
  }, [rawThreads, account_id, actions, activity, contextRemainingByThread]);

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
  const isSelectedThreadAI = selectedThread?.isAI ?? false;

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
    const id = window.setInterval(() => setActivityNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

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
    if (!singleThreadView || !selectedThreadKey) return;
    const thread = threads.find((t) => t.key === selectedThreadKey);
    if (!thread || !actions) return;

    const unread = Math.max(thread.unreadCount ?? 0, 0);
    const prevUnread = unreadSeenRef.current.get(thread.key) ?? 0;
    const visited = visitedThreadsRef.current.has(thread.key);
    const hasNewUnread = unread > 0 && unread !== prevUnread;

    const scrollToFirstUnread = () => {
      const total = thread.messageCount ?? 0;
      const index = Math.max(0, Math.min(total - 1, total - unread));
      lastScrollRequestRef.current = { thread: thread.key, reason: "unread" };
      actions.scrollToIndex?.(index);
    };

    if (hasNewUnread || (!visited && unread > 0)) {
      scrollToFirstUnread();
      actions.markThreadRead?.(thread.key, thread.messageCount);
      visitedThreadsRef.current.add(thread.key);
      unreadSeenRef.current.set(thread.key, unread);
      return;
    }

    if (!visited && unread === 0) {
      lastScrollRequestRef.current = { thread: thread.key, reason: "allread" };
      actions.scrollToIndex?.(Number.MAX_SAFE_INTEGER);
      visitedThreadsRef.current.add(thread.key);
      unreadSeenRef.current.set(thread.key, unread);
      return;
    }

    // Already visited and no new unread: preserve existing scroll (cached per thread via virtuoso cacheId).
    unreadSeenRef.current.set(thread.key, unread);
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

  const confirmDeleteThread = (threadKey: string, label?: string) => {
    const trimmedLabel = (label ?? "").trim();
    const displayLabel =
      trimmedLabel.length > 0
        ? trimmedLabel.length > 120
          ? `${trimmedLabel.slice(0, 117)}...`
          : trimmedLabel
        : null;
    Modal.confirm({
      title: displayLabel ? `Delete chat "${displayLabel}"?` : "Delete chat?",
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

  const openExportModal = (
    threadKey: string,
    label: string,
    isAI: boolean,
  ) => {
    setExportThread({ key: threadKey, label, isAI });
  };

  const closeExportModal = () => {
    setExportThread(null);
  };

  const handleExportThread = async () => {
    if (!exportThread) return;
    if (!actions?.exportThreadToMarkdown) {
      antdMessage.error("Export is not available.");
      return;
    }
    const outputPath = exportFilename.trim();
    if (!outputPath) {
      antdMessage.error("Please enter a filename.");
      return;
    }
    try {
      await actions.exportThreadToMarkdown({
        threadKey: exportThread.key,
        path: outputPath,
        includeLogs: exportIncludeLogs,
      });
      antdMessage.success("Chat exported.");
      closeExportModal();
    } catch (err) {
      console.error("failed to export chat", err);
      antdMessage.error("Failed to export chat.");
    }
  };

  const threadMenuProps = (
    threadKey: string,
    plainLabel: string,
    hasCustomName: boolean,
    isPinned: boolean,
    isAI: boolean,
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
        key: "export",
        label: "Export to Markdown",
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
        openRenameModal(threadKey, plainLabel, hasCustomName);
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
      } else if (key === "export") {
        openExportModal(threadKey, plainLabel, isAI);
      } else if (key === "delete") {
        confirmDeleteThread(threadKey, plainLabel);
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
    const isRecentlyActive =
      thread.lastActivityAt != null &&
      activityNow - thread.lastActivityAt < ACTIVITY_RECENT_MS;
    const contextRemaining = thread.contextRemaining;
    const contextSeverity =
      contextRemaining == null
        ? null
        : contextRemaining < CONTEXT_CRITICAL_PCT
          ? "critical"
          : contextRemaining < CONTEXT_WARN_PCT
            ? "warning"
            : null;
    const showDot = isRecentlyActive || contextSeverity != null;
    const dotColor =
      contextSeverity === "critical"
        ? COLORS.FG_RED
        : contextSeverity === "warning"
          ? "#f5a623"
          : COLORS.BLUE;
    const dotTitle =
      contextSeverity != null && contextRemaining != null
        ? `Context ${contextRemaining}% left — compact soon.`
        : "Recent activity";
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
          {showDot && (
            <Tooltip title={dotTitle}>
              <span
                aria-label="Recent activity"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dotColor,
                  boxShadow:
                    contextSeverity != null
                      ? `0 0 0 6px rgba(0,0,0,0.04)`
                      : undefined,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          )}
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
              menu={threadMenuProps(
                key,
                plainLabel,
                hasCustomName,
                isPinned,
                isAI,
              )}
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
          <Space size="small">
            {!isCompact && (
              <>
                <span style={{ fontSize: "12px" }}>All</span>
                <Switch
                  size="small"
                  checked={isAllThreadsSelected}
                  onChange={handleToggleAllChats}
                />
              </>
            )}
            {!IS_MOBILE && (
              <Tooltip title="Hide sidebar">
                <Button
                  size="small"
                  type="text"
                  icon={<Icon name="chevron-left" />}
                  onClick={() => setSidebarCollapsed(true)}
                />
              </Tooltip>
            )}
          </Space>
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
    actions.deleteDraft(composerDraftKey);
    setInput("");
  }
  function on_send(): void {
    sendMessage();
  }

  const renderThreadSidebar = () => {
    const minWidth = 200;
    const maxWidth = 520;
    const handleStyles = {
      right: {
        width: "6px",
        right: "-3px",
        cursor: "col-resize",
        background: "transparent",
      },
    } as const;
    const handleComponent = {
      right: (
        <div
          aria-label="Resize sidebar"
          style={{
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.0))",
          }}
        />
      ),
    };
    const sider = (
      <Layout.Sider
        width={sidebarWidth}
        style={THREAD_SIDEBAR_STYLE}
        collapsible={false}
        trigger={null}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
            overflow: "auto",
            transition: "none",
          }}
        >
          {renderSidebarContent()}
        </div>
      </Layout.Sider>
    );
    if (IS_MOBILE || sidebarCollapsed) {
      return sider;
    }
    return (
      <Resizable
        size={{ width: sidebarWidth, height: "100%" }}
        enable={{ right: true }}
        minWidth={minWidth}
        maxWidth={maxWidth}
        handleStyles={handleStyles}
        handleComponent={handleComponent}
        onResizeStop={(_, __, ___, delta) => {
          const next = Math.min(
            maxWidth,
            Math.max(minWidth, sidebarWidth + delta.width),
          );
          setSidebarWidth(next);
        }}
      >
        {sider}
      </Resizable>
    );
  };

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
                style={{ position: "absolute", top: 8, left: 8, zIndex: 10 }}
              >
                <Space size={6}>
                  <CodexConfigButton
                    threadKey={selectedThreadKey}
                    chatPath={path}
                    actions={actions}
                  />
                  <Button
                    size="small"
                    onClick={() =>
                      actions?.runCodexCompact(selectedThreadKey ?? undefined)
                    }
                    disabled={!selectedThreadKey}
                  >
                    Compact
                  </Button>
                </Space>
              </div>
            )}
          <ChatLog
            actions={actions}
            project_id={project_id}
            path={path}
            scrollToBottomRef={scrollToBottomRef}
            scrollCacheId={scrollCacheId}
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
            cacheId={`${path}${project_id}-draft-${composerDraftKey}`}
            input={input}
            on_send={on_send}
            height={INPUT_HEIGHT}
            onChange={(value) => {
              setInput(value);
              const inputText =
                submitMentionsRef.current?.(undefined, true) ?? value;
              actions?.llmEstimateCost({
                date: composerDraftKey,
                input: inputText,
              });
            }}
            submitMentionsRef={submitMentionsRef}
            syncdb={actions.syncdb}
            date={composerDraftKey}
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
          {isSelectedThreadAI ? (
            <Tooltip title="Video chat is not available in AI threads.">
              <Button style={{ height: "47.5px" }} disabled>
                <Icon name="video-camera" /> Video
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              title="Start a video chat in this thread?"
              okText="Start"
              cancelText="Cancel"
              placement="topRight"
              onConfirm={() => {
                const message = actions?.frameTreeActions
                  ?.getVideoChat()
                  .startChatting(actions);
                if (!message) {
                  return;
                }
                sendMessage(undefined, "\n\n" + message);
              }}
            >
              <Button style={{ height: "47.5px" }}>
                <Icon name="video-camera" /> Video
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>
    </div>
  );

  const renderDefaultLayout = () => (
    <Layout
      hasSider
      style={{
        ...CHAT_LAYOUT_STYLE,
        position: "relative",
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "row",
      }}
    >
      {!sidebarCollapsed && renderThreadSidebar()}
      <Layout.Content
        className="smc-vfill"
        style={{
          background: "white",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "100%",
        }}
      >
        {sidebarCollapsed && !IS_MOBILE && (
          <div style={{ padding: "10px" }}>
            <Button
              size="small"
              icon={<Icon name="bars" />}
              onClick={() => setSidebarCollapsed(false)}
            >
              Show chats
            </Button>
          </div>
        )}
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
        width={Math.max(200, sidebarWidth + 40)}
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
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {variant === "compact" ? renderCompactLayout() : renderDefaultLayout()}
      <Modal
        title={
          exportThread?.label?.trim()
            ? `Export "${exportThread.label.trim()}"`
            : "Export chat"
        }
        open={exportThread != null}
        onCancel={closeExportModal}
        onOk={handleExportThread}
        okText="Export"
        destroyOnClose
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div>
            <div style={{ marginBottom: 4, color: COLORS.GRAY_D }}>
              Filename
            </div>
            <Input
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              onPressEnter={handleExportThread}
            />
          </div>
          <Checkbox
            checked={exportIncludeLogs}
            onChange={(e) => setExportIncludeLogs(e.target.checked)}
            disabled={!exportThread?.isAI}
          >
            Include hidden AI thinking logs
          </Checkbox>
        </Space>
      </Modal>
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

function buildThreadExportPath(
  chatPath: string | undefined,
  threadKey: string,
  label?: string,
): string {
  const base = (chatPath || "chat").replace(/\/+$/, "");
  const slug = slugifyLabel(label);
  const suffix = slug || threadKey || "thread";
  return `${base}.${suffix}.md`;
}

function slugifyLabel(label?: string): string {
  if (!label) return "";
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug;
}

function computeThreadContextRemaining(
  threadKey: string,
  actions?: ChatActions,
  messages?: ChatMessages,
): number | null {
  if (!actions?.getMessagesInThread || !messages) return null;
  const ms = Number(threadKey);
  const keyIso = Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : (threadKey ?? "");
  const seq = actions.getMessagesInThread(keyIso);
  if (!seq) return null;
  const list =
    typeof seq.toArray === "function" ? seq.toArray() : Array.from(seq);
  if (!list?.length) return null;
  list.sort((a, b) => {
    const aDate = a?.get("date")?.valueOf?.() ?? 0;
    const bDate = b?.get("date")?.valueOf?.() ?? 0;
    return aDate - bDate;
  });
  let remaining: number | null = null;
  for (const entry of list) {
    const usageRaw: any = entry?.get("acp_usage") ?? entry?.get("codex_usage");
    if (!usageRaw) continue;
    const usage =
      typeof usageRaw?.toJS === "function" ? usageRaw.toJS() : usageRaw;
    const pct = calcRemainingPercent(usage);
    if (pct != null) {
      remaining = pct;
    }
  }
  return remaining;
}

function calcRemainingPercent(usage: any): number | null {
  if (!usage || typeof usage !== "object") return null;
  const contextWindow = usage.model_context_window;
  const usedTokens =
    calcUsedTokens(usage) ??
    (typeof usage.total_tokens === "number" ? usage.total_tokens : undefined);
  if (
    typeof contextWindow !== "number" ||
    !Number.isFinite(contextWindow) ||
    contextWindow <= 0 ||
    typeof usedTokens !== "number" ||
    !Number.isFinite(usedTokens)
  ) {
    return null;
  }
  const cappedUsed = Math.min(usedTokens, contextWindow);
  return Math.max(
    0,
    Math.round(((contextWindow - cappedUsed) / contextWindow) * 100),
  );
}

function calcUsedTokens(usage: any): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const keys = [
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ] as const;
  let total = 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total > 0 ? total : undefined;
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
  const activity = useEditor("activity");
  return (
    <ChatPanel
      actions={actions}
      project_id={project_id}
      path={path}
      messages={messages}
      activity={activity as any}
      fontSize={font_size}
      desc={desc}
      variant="default"
    />
  );
}
