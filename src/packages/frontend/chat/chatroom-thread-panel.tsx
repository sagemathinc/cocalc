/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Space } from "antd";
import { ChatLog } from "./chat-log";
import CodexConfigButton from "./codex";
import type { ChatActions } from "./actions";
import type { ChatMessages } from "./types";
import type * as immutable from "immutable";
import type { ThreadIndexEntry } from "./message-cache";
import type { ThreadListItem, ThreadMeta } from "./threads";

const CHAT_LOG_STYLE: React.CSSProperties = {
  padding: "0",
  background: "white",
  flex: "1 1 0",
  minHeight: 0,
  position: "relative",
} as const;

interface ChatRoomThreadPanelProps {
  actions: ChatActions;
  project_id?: string;
  path?: string;
  messages: ChatMessages;
  threadIndex?: Map<string, ThreadIndexEntry>;
  acpState: immutable.Map<string, string>;
  scrollToBottomRef: React.MutableRefObject<any>;
  scrollCacheId: string;
  fontSize?: number;
  selectedThreadKey: string | null;
  selectedThread?: ThreadMeta | ThreadListItem;
  variant: "compact" | "default";
  scrollToIndex: number | null;
  scrollToDate: string | null;
  fragmentId: string | null;
  threadsCount: number;
  onNewChat: () => void;
  composerTargetKey?: string | null;
  composerFocused?: boolean;
}

export function ChatRoomThreadPanel({
  actions,
  project_id,
  path,
  messages,
  threadIndex,
  acpState,
  scrollToBottomRef,
  scrollCacheId,
  fontSize,
  selectedThreadKey,
  selectedThread,
  variant,
  scrollToIndex,
  scrollToDate,
  fragmentId,
  threadsCount,
  onNewChat,
  composerTargetKey,
  composerFocused,
}: ChatRoomThreadPanelProps) {
  if (!selectedThreadKey) {
    return (
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
          {threadsCount === 0
            ? "No chats yet. Start a new conversation."
            : "Select a chat or start a new conversation."}
          <Button
            size="small"
            type="primary"
            style={{ marginLeft: "8px" }}
            onClick={onNewChat}
          >
            New Chat
          </Button>
        </div>
      </div>
    );
  }

  const shouldShowCodexConfig =
    selectedThread != null &&
    Boolean(selectedThread.rootMessage) &&
    Boolean(actions?.isCodexThread?.(new Date(parseInt(selectedThread.key, 10))));
  const selectedThreadForLog = selectedThreadKey ?? undefined;
  const compactThreadLabel = selectedThread
    ? "displayLabel" in selectedThread
      ? selectedThread.displayLabel
      : selectedThread.label
    : undefined;

  return (
    <div
      className="smc-vfill"
      style={{
        ...CHAT_LOG_STYLE,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {shouldShowCodexConfig && (
          <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10 }}>
            <Space size={6}>
              <CodexConfigButton
                threadKey={selectedThreadKey}
                chatPath={path ?? ""}
                actions={actions}
              />
            </Space>
          </div>
        )}
      {variant === "compact" && compactThreadLabel && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #e5e5e5",
            background: "#f7f7f7",
            color: "#555",
            fontWeight: 600,
            fontSize: "12px",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {compactThreadLabel}
        </div>
      )}
      <ChatLog
        actions={actions}
        project_id={project_id ?? ""}
        path={path ?? ""}
        messages={messages}
        threadIndex={threadIndex}
        acpState={acpState}
        scrollToBottomRef={scrollToBottomRef}
        scrollCacheId={scrollCacheId}
        mode={variant === "compact" ? "sidechat" : "standalone"}
        fontSize={fontSize}
        selectedThread={selectedThreadForLog}
        scrollToIndex={scrollToIndex}
        scrollToDate={scrollToDate}
        selectedDate={fragmentId ?? undefined}
        composerTargetKey={composerTargetKey}
        composerFocused={composerFocused}
      />
    </div>
  );
}
