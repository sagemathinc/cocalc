/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Gutter component rendered on lines of a `.tex` (or included sub-file) that
contain a `% cocalc-chat: <hash>` marker. It shows a chat icon plus a badge
that mirrors the jupyter per-cell chat UX:
 - red badge with unread count when there are unread messages for this anchor
 - gray badge with total message count when everything is read.

Clicking opens the side chat focused on that anchor's thread.
*/

import { Popconfirm, Tooltip } from "antd";
import { useFrameContext } from "@cocalc/frontend/app-framework";
import { useAnchoredThreads } from "@cocalc/frontend/chat/threads";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  hash: string;
  /** File path the marker lives in (may be the master file or a sub-file). */
  path: string;
  /** Master file path — this is what the `.sage-chat` is anchored to. */
  masterPath: string;
  project_id: string;
}

export function ChatMarkerGutter({
  hash,
  path,
  masterPath,
  project_id,
}: Props) {
  const frameContext = useFrameContext();
  const { anchoredThreads, totalUnread } = useAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const hasUnread = totalUnread > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const actions = frameContext.actions as any;
    if (hasUnread) {
      const newestUnread = anchoredThreads
        .filter((t) => t.unreadCount > 0)
        .sort((a, b) => b.newestTime - a.newestTime)[0];
      if (newestUnread) {
        actions.openAnchorChatThread?.(newestUnread.key);
        return;
      }
    }
    actions.openAnchorChat?.(hash, path);
  };

  return (
    <Tooltip title="Open chat thread for this anchor" placement="right">
      <span
        onClick={handleClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          marginLeft: -9,
          color: hasUnread ? COLORS.ANTD_RED : COLORS.GRAY_M,
        }}
      >
        <Icon name="comment" />
      </span>
    </Tooltip>
  );
}

/**
 * Inline tail widget rendered as a CodeMirror bookmark immediately after
 * `% chat: <hash>`. It shows a message-count pill (red "N unread" when the
 * user has unread messages, gray "N messages" once everything is read, and
 * nothing at all while the thread has no messages yet) followed by a gray
 * `×` with an antd Popconfirm to remove the marker.
 */
export function ChatMarkerInlineTail({
  hash,
  masterPath,
  project_id,
  onOpen,
  onConfirmDelete,
}: {
  hash: string;
  masterPath: string;
  project_id: string;
  onOpen: () => void;
  onConfirmDelete: () => void;
}) {
  const { totalMessages, totalUnread } = useAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const hasUnread = totalUnread > 0;
  const pillText =
    totalMessages <= 0
      ? null
      : hasUnread
        ? `${totalUnread} unread`
        : `${totalMessages} message${totalMessages === 1 ? "" : "s"}`;

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", marginLeft: 4 }}
    >
      {pillText != null && (
        <Tooltip
          title={
            hasUnread
              ? `${totalUnread} unread of ${totalMessages}`
              : `${totalMessages} message${totalMessages === 1 ? "" : "s"}`
          }
          placement="top"
        >
          <span
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            style={{
              display: "inline-block",
              padding: "0 6px",
              borderRadius: 10,
              fontSize: "0.85em",
              lineHeight: 1.4,
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: hasUnread ? "#ff4d4f" : "#e0e0e0",
              color: hasUnread ? "white" : "#555",
            }}
          >
            {pillText}
          </span>
        </Tooltip>
      )}
      <Popconfirm
        title="Remove chat marker?"
        description={
          <div style={{ maxWidth: 280 }}>
            This removes the marker from the source. The chat thread itself
            is kept in the <code>.sage-chat</code> file but loses its link
            to this location.
          </div>
        }
        okText="Remove"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        placement="right"
      >
        <Tooltip title="Remove this chat marker" placement="right">
          <span
            onMouseDown={(e) => {
              // Prevent CM's mousedown handler from treating this as a
              // click on the marker text (which would open the chat).
              e.stopPropagation();
            }}
            style={{
              display: "inline-block",
              cursor: "pointer",
              color: COLORS.GRAY_L,
              fontSize: "0.9em",
              marginLeft: 6,
              padding: "0 2px",
            }}
          >
            <Icon name="times-circle" />
          </span>
        </Tooltip>
      </Popconfirm>
    </span>
  );
}
