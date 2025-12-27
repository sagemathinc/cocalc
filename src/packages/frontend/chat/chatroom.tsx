/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Input,
  Modal,
  Checkbox,
  Space,
  message as antdMessage,
} from "antd";
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
import { Loading } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import type { NodeDesc } from "../frame-editors/frame-tree/types";
import { EditorComponentProps } from "../frame-editors/frame-tree/types";
import type { ChatActions } from "./actions";
import { ChatRoomComposer } from "./composer";
import { ChatRoomLayout } from "./chatroom-layout";
import { ChatRoomHeader } from "./chatroom-header";
import {
  ChatRoomSidebarContent,
  type ThreadMeta,
  type ThreadSectionWithUnread,
} from "./chatroom-sidebar";
import { ChatRoomThreadPanel } from "./chatroom-thread-panel";
import type { ChatState } from "./store";
import type { ChatMessageTyped, ChatMessages, SubmitMentionsFn } from "./types";
import { getThreadRootDate, markChatAsReadIfUnseen } from "./utils";
import { field, dateValue } from "./access";
import {
  ALL_THREADS_KEY,
  groupThreadsByRecency,
  useThreadList,
} from "./threads";
import { ChatDocProvider, useChatDoc } from "./doc-context";
import * as immutable from "immutable";

const GRID_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  margin: "auto",
  minHeight: 0,
  flex: 1,
} as const;

const DEFAULT_SIDEBAR_WIDTH = 260;


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
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  const activity: undefined | immutable.Map<string, number> =
    useEditor("activity");
  const acpState: immutable.Map<string, string> = useEditor("acpState");
  const account_id = useTypedRedux("account", "account_id");
  if (IS_MOBILE) {
    variant = "compact";
  }
  const [input, setInput] = useState("");
  const hasInput = input.trim().length > 0;
  const search = getDescValue(desc, "data-search") ?? "";
  const filterRecentH: number = getDescValue(desc, "data-filterRecentH") ?? 0;
  const selectedHashtags = getDescValue(desc, "data-selectedHashtags");
  const scrollToIndex = getDescValue(desc, "data-scrollToIndex") ?? null;
  const scrollToDate = getDescValue(desc, "data-scrollToDate") ?? null;
  const fragmentId = getDescValue(desc, "data-fragmentId") ?? null;
  const storedSidebarWidth = getDescValue(desc, "data-sidebarWidth");
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    typeof storedSidebarWidth === "number" && storedSidebarWidth > 50
      ? storedSidebarWidth
      : DEFAULT_SIDEBAR_WIDTH,
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
  const [exportThread, setExportThread] = useState<{
    key: string;
    label: string;
    isAI: boolean;
  } | null>(null);
  const [exportFilename, setExportFilename] = useState<string>("");
  const [exportIncludeLogs, setExportIncludeLogs] = useState<boolean>(false);
  const [allowAutoSelectThread, setAllowAutoSelectThread] =
    useState<boolean>(true);
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
    if (!actions?.frameTreeActions?.set_frame_data || !actions?.frameId) return;
    actions.frameTreeActions.set_frame_data({
      id: actions.frameId,
      sidebarWidth,
    });
  }, [sidebarWidth, actions?.frameTreeActions, actions?.frameId]);

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
  const threads = useMemo<ThreadMeta[]>(() => {
    return rawThreads.map((thread) => {
      const rootMessage = thread.rootMessage;
      const storedName = field<string>(rootMessage, "name")?.trim();
      const hasCustomName = !!storedName;
      const displayLabel = storedName || thread.label;
      const pinValue = field<any>(rootMessage, "pin");
      const isPinned =
        pinValue === true ||
        pinValue === "true" ||
        pinValue === 1 ||
        pinValue === "1";
      const readField =
        account_id && rootMessage
          ? field<any>(rootMessage, `read-${account_id}`)
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
      const lastActivityAt = activity?.get(thread.key);
      return {
        ...thread,
        displayLabel,
        hasCustomName,
        readCount,
        unreadCount,
        isAI: !!isAI,
        isPinned,
        lastActivityAt,
      };
    });
  }, [rawThreads, account_id, actions, activity]);

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
        const dateField = dateValue(msg);
        if (dateField?.valueOf?.() === parsed) {
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

  const openExportModal = (threadKey: string, label: string, isAI: boolean) => {
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

  const totalUnread = useMemo(
    () => threadSections.reduce((sum, section) => sum + section.unreadCount, 0),
    [threadSections],
  );

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

  const renderChatContent = () => (
    <div className="smc-vfill" style={GRID_STYLE}>
      <ChatRoomHeader
        actions={actions}
        messagesSize={messages?.size ?? 0}
        search={search}
        showThreadFilters={showThreadFilters}
        disableFilters={disableFilters}
        filterRecentH={filterRecentH}
        filterRecentHCustom={filterRecentHCustom}
        setFilterRecentHCustom={setFilterRecentHCustom}
        filterRecentOpen={filterRecentOpen}
        setFilterRecentOpen={setFilterRecentOpen}
      />
      <ChatRoomThreadPanel
        actions={actions}
        project_id={project_id}
        path={path}
        messages={messages as ChatMessages}
        acpState={acpState}
        scrollToBottomRef={scrollToBottomRef}
        scrollCacheId={scrollCacheId}
        fontSize={fontSize}
        search={search}
        filterRecentH={filterRecentH}
        selectedHashtags={selectedHashtags}
        selectedThreadKey={selectedThreadKey}
        selectedThread={selectedThread}
        variant={variant}
        scrollToIndex={scrollToIndex}
        scrollToDate={scrollToDate}
        fragmentId={fragmentId}
        threadsCount={threads.length}
        onNewChat={() => {
          setAllowAutoSelectThread(false);
          setSelectedThreadKey(null);
        }}
      />
      <ChatRoomComposer
        actions={actions}
        project_id={project_id}
        path={path}
        fontSize={fontSize}
        composerDraftKey={composerDraftKey}
        input={input}
        setInput={setInput}
        on_send={on_send}
        submitMentionsRef={submitMentionsRef}
        hasInput={hasInput}
        isSelectedThreadAI={isSelectedThreadAI}
        sendMessage={sendMessage}
      />
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
      <ChatRoomLayout
        variant={variant === "compact" ? "compact" : "default"}
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
        sidebarVisible={sidebarVisible}
        setSidebarVisible={setSidebarVisible}
        totalUnread={totalUnread}
        sidebarContent={
          isCompact ? undefined : (
            <ChatRoomSidebarContent
              actions={actions}
              isCompact={isCompact}
              isAllThreadsSelected={isAllThreadsSelected}
              selectedThreadKey={selectedThreadKey}
              setSelectedThreadKey={setSelectedThreadKey}
              setAllowAutoSelectThread={setAllowAutoSelectThread}
              setSidebarVisible={setSidebarVisible}
              threadSections={threadSections}
              openRenameModal={openRenameModal}
              openExportModal={openExportModal}
              confirmDeleteThread={confirmDeleteThread}
              handleToggleAllChats={handleToggleAllChats}
            />
          )
        }
        chatContent={renderChatContent()}
        onNewChat={() => {
          setAllowAutoSelectThread(false);
          setSelectedThreadKey(null);
        }}
        newChatSelected={!selectedThreadKey}
      />
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

function ChatRoomInner({
  actions,
  project_id,
  path,
  font_size,
  desc,
}: EditorComponentProps) {
  const { messages } = useChatDoc();
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  // subscribe to syncdbReady to force re-render when sync attaches
  useEditor("syncdbReady");
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

export function ChatRoom(props: EditorComponentProps) {
  return (
    <ChatDocProvider cache={props.actions?.messageCache}>
      <ChatRoomInner {...props} />
    </ChatDocProvider>
  );
}
