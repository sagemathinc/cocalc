/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import {
  Badge,
  Button,
  Dropdown,
  Layout,
  Menu,
  Popconfirm,
  Space,
  Switch,
  Tooltip,
  message as antdMessage,
} from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { Resizable } from "re-resizable";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";
import type { ThreadMeta, ThreadSectionWithUnread } from "./threads";

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

const ACTIVITY_RECENT_MS = 7_500;

function stripHtml(value: string): string {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "");
}

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

interface ChatRoomSidebarProps {
  width: number;
  setWidth: (value: number) => void;
  children: React.ReactNode;
}

export function ChatRoomSidebar({
  width,
  setWidth,
  children,
}: ChatRoomSidebarProps) {
  const minWidth = 125;
  const maxWidth = 600;
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
  } as const;
  const sider = (
    <Layout.Sider
      width={width}
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
        {children}
      </div>
    </Layout.Sider>
  );
  if (IS_MOBILE) {
    return sider;
  }
  return (
    <Resizable
      size={{ width, height: "100%" }}
      enable={{ right: true }}
      minWidth={minWidth}
      maxWidth={maxWidth}
      handleStyles={handleStyles}
      handleComponent={handleComponent}
      onResizeStop={(_, __, ___, delta) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, width + delta.width),
        );
        setWidth(next);
      }}
    >
      {sider}
    </Resizable>
  );
}

interface ChatRoomSidebarContentProps {
  actions: ChatActions;
  isCompact: boolean;
  isAllThreadsSelected: boolean;
  selectedThreadKey: string | null;
  setSelectedThreadKey: (key: string | null) => void;
  setAllowAutoSelectThread: (value: boolean) => void;
  setSidebarVisible: (value: boolean) => void;
  threadSections: ThreadSectionWithUnread[];
  openRenameModal: (
    threadKey: string,
    plainLabel: string,
    hasCustomName: boolean,
  ) => void;
  openExportModal: (threadKey: string, label: string, isAI: boolean) => void;
  openForkModal: (threadKey: string, label: string, isAI: boolean) => void;
  confirmDeleteThread: (threadKey: string, label: string) => void;
  handleToggleAllChats: (value: boolean) => void;
}

export function ChatRoomSidebarContent({
  actions,
  isCompact,
  isAllThreadsSelected,
  selectedThreadKey,
  setSelectedThreadKey,
  setAllowAutoSelectThread,
  setSidebarVisible,
  threadSections,
  openRenameModal,
  openExportModal,
  openForkModal,
  confirmDeleteThread,
  handleToggleAllChats,
}: ChatRoomSidebarContentProps) {
  const [hoveredThread, setHoveredThread] = React.useState<string | null>(null);
  const [openThreadMenuKey, setOpenThreadMenuKey] = React.useState<string | null>(
    null,
  );
  const [activityNow] = React.useState<number>(Date.now());

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
        key: "fork",
        label: "Fork chat…",
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
      } else if (key === "fork") {
        openForkModal(threadKey, plainLabel, isAI);
      } else if (key === "delete") {
        confirmDeleteThread(threadKey, plainLabel);
      }
    },
  });

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
    const showDot = isRecentlyActive;
    const dotColor = COLORS.BLUE;
    const dotTitle = "Recent activity";
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

  return (
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
}
