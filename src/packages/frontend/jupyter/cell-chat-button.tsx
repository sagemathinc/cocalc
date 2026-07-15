/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Badge, Dropdown, Tooltip } from "antd";
import React from "react";

import { useFrameContext } from "@cocalc/frontend/app-framework";
import { useAnchoredThreads } from "@cocalc/frontend/chat/threads";
import { Icon } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { CODE_BAR_BTN_STYLE } from "./consts";

const MESSAGE_COUNT_BADGE_STYLE: React.CSSProperties = {
  backgroundColor: "var(--cocalc-bg-hover, #e8e8e8)",
  color: "var(--cocalc-text-primary-strong, #555)",
};

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
  const { anchoredThreads, totalUnread } = useAnchoredThreads(
    project_id,
    path,
    cellId,
  );
  if (totalUnread <= 0) return null;

  // Find the newest unread thread to open on click
  const newestUnread = anchoredThreads
    .filter((t) => t.unreadCount > 0)
    .sort((a, b) => b.newestTime - a.newestTime)[0];

  return (
    <Tooltip
      title={`${totalUnread} unread cell chat message${totalUnread > 1 ? "s" : ""}`}
    >
      <Badge
        size="small"
        count={totalUnread}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (newestUnread) {
            (frameContext.actions as any).openCellChatThread?.(
              newestUnread.key,
            );
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
  const { anchoredThreads, totalMessages, totalUnread } = useAnchoredThreads(
    project_id,
    path,
    cellId,
  );
  // The newest thread with unread messages — this is what the main button opens.
  const newestUnreadThread = React.useMemo(
    () =>
      anchoredThreads
        .filter((t) => t.unreadCount > 0)
        .sort((a, b) => b.newestTime - a.newestTime)[0] ?? null,
    [anchoredThreads],
  );

  const handleMainClick = () => {
    if (newestUnreadThread) {
      // Open the newest unread thread directly
      (frameContext.actions as any).openCellChatThread?.(
        newestUnreadThread.key,
      );
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
  for (const t of anchoredThreads) {
    const hasUnread = t.unreadCount > 0;
    menuItems.push({
      key: t.key,
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t.label}
          {hasUnread ? (
            <Badge size="small" count={t.unreadCount} />
          ) : (
            <Badge
              size="small"
              count={t.messageCount}
              style={MESSAGE_COUNT_BADGE_STYLE}
            />
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
  if (anchoredThreads.length > 0) {
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
                style={
                  hasUnread
                    ? { marginLeft: 4 }
                    : { ...MESSAGE_COUNT_BADGE_STYLE, marginLeft: 4 }
                }
              />
            )}
          </span>
        </Tooltip>
      </Dropdown.Button>
    </div>
  );
}
