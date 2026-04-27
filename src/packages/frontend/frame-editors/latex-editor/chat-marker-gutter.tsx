/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Gutter component rendered on lines of a `.tex` (or included sub-file) that
contain a `% chat: <hash>` marker. It shows a chat icon plus a badge
that mirrors the jupyter per-cell chat UX:
 - red badge with unread count when there are unread messages for this anchor
 - gray badge with total message count when everything is read.

When the marker is *stale* (its hash matches a resolved thread, no active
thread exists — typically a marker in a sub-file that wasn't open at
resolve time), the icon is muted and clicking it does nothing on its own;
the inline tail is the place to remove the stale marker.

Clicking on a non-stale marker opens the side chat focused on that
anchor's thread.
*/

import { Popconfirm, Tooltip } from "antd";
import {
  useAnchoredThreads,
  useResolvedAnchoredThreads,
} from "@cocalc/frontend/chat/threads";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  hash: string;
  /** File path the marker lives in (may be the master file or a sub-file). */
  path: string;
  /** Master file path — this is what the `.sage-chat` is anchored to. */
  masterPath: string;
  project_id: string;
  /**
   * Called on click. We take the callbacks as props (rather than pulling
   * them from `useFrameContext`) because this component is mounted via a
   * standalone `createRoot` that is NOT under the editor's
   * `FrameContext.Provider` — the hook would return the empty default
   * actions object and clicks would be a silent no-op.
   */
  openAnchorChat: (hash: string, path: string) => void;
  openAnchorChatThread: (threadKey: string) => void;
}

export function ChatMarkerGutter({
  hash,
  path,
  masterPath,
  project_id,
  openAnchorChat,
  openAnchorChatThread,
}: Props) {
  const { anchoredThreads, totalUnread } = useAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const { hasResolved } = useResolvedAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const isStale = hasResolved && anchoredThreads.length === 0;
  const hasUnread = totalUnread > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStale) return;
    if (hasUnread) {
      const newestUnread = anchoredThreads
        .filter((t) => t.unreadCount > 0)
        .sort((a, b) => b.newestTime - a.newestTime)[0];
      if (newestUnread) {
        openAnchorChatThread(newestUnread.key);
        return;
      }
    }
    openAnchorChat(hash, path);
  };

  return (
    <Tooltip
      title={
        isStale
          ? "Stale marker — its chat thread was resolved. Use × to remove."
          : "Open chat thread for this anchor"
      }
      placement="right"
    >
      <span
        onClick={handleClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          cursor: isStale ? "default" : "pointer",
          marginLeft: -9,
          color: isStale
            ? COLORS.GRAY_L
            : hasUnread
              ? COLORS.ANTD_RED
              : COLORS.GRAY_M,
          opacity: isStale ? 0.6 : 1,
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
 * `×` whose Popconfirm resolves the chat (marks the thread resolved AND
 * removes the marker). Stale markers (hash matches a resolved thread, no
 * active thread) skip the count pill entirely and offer a plain "remove
 * stale marker" affordance instead.
 */
export function ChatMarkerInlineTail({
  hash,
  masterPath,
  project_id,
  onOpen,
  onConfirmResolve,
  onConfirmRemoveStale,
}: {
  hash: string;
  masterPath: string;
  project_id: string;
  onOpen: () => void;
  /** Mark the anchored thread(s) resolved AND remove the marker. */
  onConfirmResolve: () => void;
  /** Stale marker only: just remove the marker; thread already resolved. */
  onConfirmRemoveStale: () => void;
}) {
  const { totalMessages, totalUnread, anchoredThreads } = useAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const { hasResolved } = useResolvedAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const isStale = hasResolved && anchoredThreads.length === 0;
  const hasUnread = totalUnread > 0;
  const pillText =
    isStale || totalMessages <= 0
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
              padding: "0 10px",
              borderRadius: 10,
              fontSize: "0.85em",
              lineHeight: 1.4,
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: hasUnread ? COLORS.ANTD_RED : COLORS.GRAY_LL,
              color: hasUnread ? COLORS.WHITE : COLORS.GRAY_DD,
            }}
          >
            {pillText}
          </span>
        </Tooltip>
      )}
      {isStale && (
        <Tooltip title="Stale marker — chat is resolved" placement="top">
          <span
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              display: "inline-block",
              padding: "0 10px",
              borderRadius: 10,
              fontSize: "0.85em",
              lineHeight: 1.4,
              fontStyle: "italic",
              color: COLORS.GRAY_M,
              backgroundColor: COLORS.GRAY_LL,
            }}
          >
            resolved
          </span>
        </Tooltip>
      )}
      <Popconfirm
        title={
          isStale ? "Remove stale marker?" : "Resolve chat and remove marker?"
        }
        description={
          <div style={{ maxWidth: 320 }}>
            {isStale ? (
              <>
                The chat thread was already resolved. This just removes the
                leftover <code>% chat: …</code> marker from the source.
              </>
            ) : (
              <>
                Marks the chat thread as <b>resolved</b> and removes every{" "}
                <code>% chat: …</code> marker from all files. The thread is kept
                in <code>.sage-chat</code> as a read-only archive.
              </>
            )}
          </div>
        }
        okText={isStale ? "Remove" : "Resolve"}
        cancelText="Cancel"
        onConfirm={isStale ? onConfirmRemoveStale : onConfirmResolve}
        placement="right"
      >
        <Tooltip
          title={
            isStale
              ? "Remove this stale marker"
              : "Resolve chat and remove this marker"
          }
          placement="right"
        >
          <span
            onMouseDown={(e) => {
              // Prevent CM's mousedown handler from treating this as a
              // click on the marker text (which would open the chat).
              e.stopPropagation();
            }}
            style={{
              display: "inline-block",
              cursor: "pointer",
              // Stale-remove stays subdued; the resolve check is a
              // primary action (turns a chat into a closed TODO), so
              // give it a clearly readable green and a slightly bigger
              // hit target.
              color: isStale ? COLORS.GRAY_L : COLORS.BS_GREEN_D,
              fontSize: isStale ? "0.9em" : "1.1em",
              marginLeft: 8,
              padding: "0 4px",
            }}
          >
            <Icon name={isStale ? "times-circle" : "check-circle"} />
          </span>
        </Tooltip>
      </Popconfirm>
    </span>
  );
}
