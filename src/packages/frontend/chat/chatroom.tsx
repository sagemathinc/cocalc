/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

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
import type { NodeDesc } from "../frame-editors/frame-tree/types";
import { EditorComponentProps } from "../frame-editors/frame-tree/types";
import type { ChatActions } from "./actions";
import { ChatRoomComposer } from "./composer";
import { ChatRoomLayout } from "./chatroom-layout";
import { ChatRoomHeader } from "./chatroom-header";
import { ChatRoomSidebarContent } from "./chatroom-sidebar";
import type { ChatRoomModalHandlers } from "./chatroom-modals";
import { ChatRoomModals } from "./chatroom-modals";
import type { ChatRoomThreadActionHandlers } from "./chatroom-thread-actions";
import { ChatRoomThreadActions } from "./chatroom-thread-actions";
import { ChatRoomThreadPanel } from "./chatroom-thread-panel";
import type { ChatState } from "./store";
import type { ChatMessages, SubmitMentionsFn } from "./types";
import { markChatAsReadIfUnseen } from "./utils";
import { useThreadSections } from "./threads";
import { ChatDocProvider, useChatDoc } from "./doc-context";
import * as immutable from "immutable";
import { useChatThreadSelection } from "./thread-selection";

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
  const [modalHandlers, setModalHandlers] =
    useState<ChatRoomModalHandlers | null>(null);
  const [threadActionHandlers, setThreadActionHandlers] =
    useState<ChatRoomThreadActionHandlers | null>(null);
  const submitMentionsRef = useRef<SubmitMentionsFn | undefined>(undefined);
  const scrollToBottomRef = useRef<any>(null);
  const lastScrollRequestRef = useRef<{
    thread: string;
    reason: "unread" | "allread";
  } | null>(null);
  const visitedThreadsRef = useRef<Set<string>>(new Set());
  const unreadSeenRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!actions?.frameTreeActions?.set_frame_data || !actions?.frameId) return;
    actions.frameTreeActions.set_frame_data({
      id: actions.frameId,
      sidebarWidth,
    });
  }, [sidebarWidth, actions?.frameTreeActions, actions?.frameId]);

  const { threads, threadSections } = useThreadSections({
    messages,
    activity,
    accountId: account_id,
    actions,
  });

  const {
    selectedThreadKey,
    setSelectedThreadKey,
    setAllowAutoSelectThread,
    selectedThreadDate,
    isAllThreadsSelected,
    singleThreadView,
    selectedThread,
    handleToggleAllChats,
  } = useChatThreadSelection({
    actions,
    threads,
    messages,
    fragmentId,
    storedThreadFromDesc,
  });

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
  const isSelectedThreadAI = selectedThread?.isAI ?? false;

  const scrollCacheId = useMemo(() => {
    const base = `${project_id ?? ""}${path ?? ""}`;
    return `${base}-${selectedThreadKey ?? "all"}`;
  }, [project_id, path, selectedThreadKey]);

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
              openRenameModal={
                modalHandlers?.openRenameModal ?? (() => undefined)
              }
              openExportModal={
                modalHandlers?.openExportModal ?? (() => undefined)
              }
              confirmDeleteThread={
                threadActionHandlers?.confirmDeleteThread ?? (() => undefined)
              }
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
      <ChatRoomModals
        actions={actions}
        path={path}
        onHandlers={setModalHandlers}
      />
      <ChatRoomThreadActions
        actions={actions}
        selectedThreadKey={selectedThreadKey}
        setSelectedThreadKey={setSelectedThreadKey}
        onHandlers={setThreadActionHandlers}
      />
    </div>
  );
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
