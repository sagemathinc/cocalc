/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Badge, Dropdown, Tooltip } from "antd";
import React from "react";

import {
  redux,
  useFrameContext,
  useRedux,
} from "@cocalc/frontend/app-framework";
import type { ThreadListItem } from "@cocalc/frontend/chat/threads";
import { useThreadList } from "@cocalc/frontend/chat/threads";
import { Icon } from "@cocalc/frontend/components";
import { chatFile } from "@cocalc/frontend/frame-editors/generic/chat";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import { CODE_BAR_BTN_STYLE } from "./consts";

/** Shared hook: cell threads with adjusted counts (excludes empty anchor root). */
function useCellThreads(
  project_id: string,
  path: string,
  cellId: string,
): {
  cellThreads: ThreadListItem[];
  totalMessages: number;
  totalUnread: number;
} {
  const account_id = redux.getStore("account")?.get_account_id();
  const chatPath = chatFile(path);
  const chatMessages = useRedux(["messages"], project_id, chatPath);
  const allThreads = useThreadList(chatMessages, account_id);
  const cellThreads = React.useMemo(
    () =>
      allThreads
        .filter((t) => t.rootMessage?.get("cell_id") === cellId)
        .map((t) => {
          // Exclude the empty anchor root from counts — it's not a real message.
          // Only subtract from unreadCount if the root itself is counted as unread
          // (i.e., root timestamp > lastread, which happens when the viewer hasn't
          // seen the thread yet).
          // Only subtract from unreadCount when using timestamp-based tracking
          // and the root is actually newer than lastread. For legacy threads
          // (lastReadTimestamp == null), unreadCount is computed from the
          // count-based read-* field where the root is already accounted for.
          const rootDate = t.rootMessage?.get("date")?.valueOf() ?? 0;
          const rootIsUnread =
            t.lastReadTimestamp != null && rootDate > t.lastReadTimestamp;
          return {
            ...t,
            messageCount: Math.max(t.messageCount - 1, 0),
            unreadCount: rootIsUnread
              ? Math.max(t.unreadCount - 1, 0)
              : t.unreadCount,
          };
        }),
    [allThreads, cellId],
  );
  const totalMessages = React.useMemo(
    () => cellThreads.reduce((s, t) => s + t.messageCount, 0),
    [cellThreads],
  );
  const totalUnread = React.useMemo(
    () => cellThreads.reduce((s, t) => s + t.unreadCount, 0),
    [cellThreads],
  );
  return { cellThreads, totalMessages, totalUnread };
}

/** Always-visible unread badge for a cell. Shows only when there are unread messages. */
export function CellChatUnreadBadge({
  cellId,
  project_id,
  path,
}: {
  cellId: string;
  project_id: string;
  path: string;
}) {
  const frameContext = useFrameContext();
  const { cellThreads, totalUnread } = useCellThreads(
    project_id,
    path,
    cellId,
  );
  if (totalUnread <= 0) return null;

  // Find the newest unread thread to open on click
  const newestUnread = cellThreads
    .filter((t) => t.unreadCount > 0)
    .sort((a, b) => b.newestTime - a.newestTime)[0];

  return (
    <Tooltip title={`${totalUnread} unread cell chat message${totalUnread > 1 ? "s" : ""}`}>
      <Badge
        size="small"
        count={totalUnread}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (newestUnread) {
            (frameContext.actions as any).openCellChatThread?.(newestUnread.key);
          } else {
            (frameContext.actions as any).openCellChat?.(cellId);
          }
        }}
      />
    </Tooltip>
  );
}

export function CellChatButton({
  cellId,
  project_id,
  path,
}: {
  cellId: string;
  project_id: string;
  path: string;
}) {
  const frameContext = useFrameContext();
  const { cellThreads, totalMessages, totalUnread } = useCellThreads(
    project_id,
    path,
    cellId,
  );
  // The newest thread with unread messages — this is what the main button opens.
  const newestUnreadThread = React.useMemo(
    () =>
      cellThreads
        .filter((t) => t.unreadCount > 0)
        .sort((a, b) => b.newestTime - a.newestTime)[0] ?? null,
    [cellThreads],
  );

  const handleMainClick = () => {
    if (newestUnreadThread) {
      // Open the newest unread thread directly
      (frameContext.actions as any).openCellChatThread?.(newestUnreadThread.key);
    } else {
      // No unread — default behavior (find or create thread)
      (frameContext.actions as any).openCellChat?.(cellId);
    }
    track("jupyter_cell_buttonbar", {
      button: "chat",
      project_id,
      path,
    });
  };

  const menuItems: MenuProps["items"] = [];
  for (const t of cellThreads) {
    const hasUnread = t.unreadCount > 0;
    menuItems.push({
      key: t.key,
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t.label}
          {hasUnread ? (
            <Badge size="small" count={t.unreadCount} />
          ) : (
            <Badge size="small" count={t.messageCount} color={COLORS.GRAY_L} />
          )}
        </span>
      ),
      onClick: () => {
        (frameContext.actions as any).openCellChatThread?.(t.key);
        track("jupyter_cell_buttonbar", {
          button: "chat-thread",
          project_id,
          path,
        });
      },
    });
  }
  if (cellThreads.length > 0) {
    menuItems.push({ type: "divider" });
  }
  menuItems.push({
    key: "new-thread",
    icon: <Icon name="plus" />,
    label: "New Thread",
    onClick: () => {
      (frameContext.actions as any).openCellChatNewThread?.(cellId);
      track("jupyter_cell_buttonbar", {
        button: "chat-new",
        project_id,
        path,
      });
    },
  });

  // Badge: red with unread count if any unread, otherwise gray with total
  const hasUnread = totalUnread > 0;
  const badgeCount = hasUnread ? totalUnread : totalMessages;
  const badgeColor = hasUnread ? undefined : COLORS.GRAY_L;

  return (
    <div>
      <Dropdown.Button
        size="small"
        type="text"
        trigger={["click"]}
        mouseLeaveDelay={1.5}
        icon={<Icon name="angle-down" />}
        onClick={handleMainClick}
        menu={{ items: menuItems }}
      >
        <Tooltip placement="top" title="Discuss this cell in side chat">
          <span style={CODE_BAR_BTN_STYLE}>
            <Icon name="comment" /> Chat
            {badgeCount > 0 && (
              <Badge
                size="small"
                count={badgeCount}
                color={badgeColor}
                style={{ marginLeft: 4 }}
              />
            )}
          </span>
        </Tooltip>
      </Dropdown.Button>
    </div>
  );
}
