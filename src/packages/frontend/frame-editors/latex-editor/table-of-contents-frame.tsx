/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
LaTeX-specific TOC frame component. Wraps the shared markdown-editor TOC
behavior, but renders chat-marker entries with a live-updating count pill
sourced from `useAnchoredThreads`. Heading and bookmark entries use the
same look-and-feel as the shared component (small visual duplication is
intentional — exporting the shared `Header` would broaden a private API for
a single caller).
*/

import { useEffect, useMemo } from "react";

import { useRedux } from "@cocalc/frontend/app-framework";
import {
  useAnchoredThreads,
  useResolvedAnchoredThreads,
} from "@cocalc/frontend/chat/threads";
import {
  Icon,
  IconName,
  Loading,
  Markdown,
  TableOfContentsEntry,
  TableOfContentsEntryList,
  TableOfContentsEntryMap,
} from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import { Actions as LatexActions } from "./actions";

interface Props {
  font_size: number;
  actions: LatexActions;
}

export function LatexTableOfContents({ font_size, actions }: Props) {
  useEffect(() => {
    // Mirror the shared component: defer one tick so the redux subscription
    // below sees the first parse.
    setTimeout(() => actions.updateTableOfContents(true));
  }, []);
  const contents: TableOfContentsEntryList | undefined = useRedux([
    actions.name,
    "contents",
  ]);
  // The TOC may have been parsed from a sub-file (when the user is
  // focused on `\input{f1.tex}` etc.); contents_path tracks which file.
  // Fall back to the master path when not yet set.
  const contentsPath: string =
    useRedux([actions.name, "contents_path"]) ?? actions.path;

  if (contents == null) {
    return <Loading theme="medium" />;
  }
  return (
    <LatexTOCBody
      contents={contents}
      fontSize={font_size}
      project_id={actions.project_id}
      masterPath={actions.path}
      sourcePath={contentsPath}
      scrollTo={actions.scrollToHeading.bind(actions)}
      openAnchorChat={(hash, srcPath) => {
        void actions.openAnchorChat(hash, srcPath);
      }}
    />
  );
}

/**
 * Renders an immutable list of TOC entries with a chat-marker dispatcher:
 * entries whose `extra.kind === "chat"` get a row component that calls
 * `useAnchoredThreads` for a live count pill; everything else uses the
 * plain row (heading/bookmark) styling. Exported so the Output frame's
 * Contents tab can reuse the same rendering as the standalone TOC frame.
 */
export function LatexTOCBody({
  contents,
  fontSize,
  project_id,
  masterPath,
  sourcePath,
  scrollTo,
  openAnchorChat,
  ifEmpty,
}: {
  contents: TableOfContentsEntryList;
  fontSize?: number;
  project_id: string;
  /** Master file path — used to look up anchored threads (per-master sage-chat). */
  masterPath: string;
  /**
   * The path the contents were parsed from. When the TOC reflects a
   * sub-file, this differs from `masterPath` and is what we forward
   * with `openAnchorChat` so a fresh pending thread saves the correct
   * `path` field on its root message — without it, jump-to-anchor
   * fallback after reload can't find the marker on clients that
   * haven't scanned the sub-file. Defaults to `masterPath`.
   */
  sourcePath?: string;
  scrollTo: (entry: TableOfContentsEntry) => void;
  /**
   * Called when the user clicks the chat-marker row's count pill — opens
   * the side chat focused on this anchor's thread (vs. clicking the row's
   * heading link, which jumps to the source location). The `path`
   * argument is forwarded so the chat actions stage a pending anchor
   * with that path for empty threads.
   */
  openAnchorChat?: (hash: string, path: string) => void;
  ifEmpty?: React.ReactNode;
}) {
  const effectiveSourcePath = sourcePath ?? masterPath;
  return useMemo(() => {
    if (contents.size === 0 && ifEmpty != null) {
      return <>{ifEmpty}</>;
    }
    const rows: React.JSX.Element[] = [];
    for (const entry of contents) {
      const id = entry.get("id");
      const extra = entry.get("extra") as
        | { kind?: string; hash?: string }
        | undefined;
      const isChat =
        extra != null &&
        (typeof (extra as any).get === "function"
          ? (extra as any).get("kind")
          : extra.kind) === "chat";
      if (isChat) {
        const hashRaw =
          typeof (extra as any).get === "function"
            ? (extra as any).get("hash")
            : extra?.hash;
        if (typeof hashRaw === "string") {
          rows.push(
            <ChatRow
              key={id}
              entry={entry}
              hash={hashRaw}
              project_id={project_id}
              masterPath={masterPath}
              onScrollTo={() => scrollTo(entry.toJS())}
              onOpenChat={
                openAnchorChat
                  ? () => openAnchorChat(hashRaw, effectiveSourcePath)
                  : undefined
              }
            />,
          );
          continue;
        }
      }
      rows.push(
        <PlainRow
          key={id}
          entry={entry}
          onClick={() => scrollTo(entry.toJS())}
        />,
      );
    }
    return (
      <div
        style={{
          overflowY: "auto",
          height: "100%",
          paddingTop: "15px",
          fontSize: `${fontSize ?? 14}px`,
        }}
      >
        {rows}
      </div>
    );
  }, [
    contents,
    fontSize,
    project_id,
    masterPath,
    effectiveSourcePath,
    ifEmpty,
    openAnchorChat,
  ]);
}

function PlainRow({
  entry,
  onClick,
}: {
  entry: TableOfContentsEntryMap;
  onClick: () => void;
}) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer" }}>
      <RowHeader
        level={entry.get("level", 1)}
        value={entry.get("value")}
        icon={entry.get("icon")}
        iconColor={entry.get("iconColor")}
      />
    </div>
  );
}

function ChatRow({
  entry,
  hash,
  project_id,
  masterPath,
  onScrollTo,
  onOpenChat,
}: {
  entry: TableOfContentsEntryMap;
  hash: string;
  project_id: string;
  masterPath: string;
  /** Click on the row's heading link → jump to source location. */
  onScrollTo: () => void;
  /** Click on the count pill → open the side chat at this anchor. */
  onOpenChat?: () => void;
}) {
  const { anchoredThreads, totalMessages, totalUnread } = useAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  const { hasResolved } = useResolvedAnchoredThreads(
    project_id,
    masterPath,
    hash,
  );
  // Stale = the marker is still in source, but its chat thread is
  // resolved (no active anchored thread). Render muted, no count, no
  // open-chat affordance — clicking the pill in this state would stage
  // a fresh pending thread on a hash that's already retired, which is
  // exactly what the resolved-archive design prohibits.
  const isStale = hasResolved && anchoredThreads.length === 0;
  const hasUnread = !isStale && totalUnread > 0;
  const pillText = isStale
    ? "resolved"
    : hasUnread
      ? `${totalUnread} unread`
      : `${totalMessages} message${totalMessages === 1 ? "" : "s"}`;
  const pillTitle = isStale
    ? "Stale marker — its chat thread was resolved"
    : onOpenChat
      ? hasUnread
        ? `${totalUnread} unread of ${totalMessages} — click to open chat`
        : `${totalMessages} message${totalMessages === 1 ? "" : "s"} — click to open chat`
      : pillText;
  const pillClickable = !isStale && onOpenChat != null;
  return (
    <div
      onClick={onScrollTo}
      style={{
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        opacity: isStale ? 0.6 : 1,
      }}
      title={`Chat anchor ${hash}`}
    >
      <RowHeader
        level={entry.get("level", 6)}
        value={entry.get("value")}
        icon={entry.get("icon", "comment")}
        iconColor={entry.get("iconColor")}
      />
      <span
        title={pillTitle}
        onClick={
          pillClickable
            ? (e) => {
                e.stopPropagation();
                onOpenChat!();
              }
            : undefined
        }
        style={{
          display: "inline-block",
          marginLeft: 8,
          padding: "0 8px",
          borderRadius: 10,
          fontSize: "0.8em",
          lineHeight: 1.4,
          fontWeight: 500,
          fontStyle: isStale ? "italic" : "normal",
          backgroundColor: hasUnread ? COLORS.ANTD_RED : COLORS.GRAY_LL,
          color: hasUnread ? COLORS.WHITE : COLORS.GRAY_M,
          whiteSpace: "nowrap",
          cursor: pillClickable ? "pointer" : "default",
        }}
      >
        {pillText}
      </span>
    </div>
  );
}

function RowHeader({
  level,
  value,
  icon,
  iconColor,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  value: string;
  icon?: IconName;
  iconColor?: string;
}) {
  if (level < 1) level = 1;
  if (level > 6) level = 6;
  const indent = INDENTS[level];
  return (
    <div
      style={{
        whiteSpace: "nowrap",
        fontWeight: level == 1 ? "bold" : undefined,
      }}
    >
      <span style={{ width: indent.gutter, display: "inline-block" }}>
        {icon && (
          <Icon
            name={icon}
            style={{
              color: iconColor ?? COLORS.GRAY_M,
              marginLeft: indent.iconLeft,
            }}
          />
        )}
      </span>
      <a
        style={{
          display: "inline-block",
          marginBottom: "-1em",
          marginLeft: "10px",
        }}
      >
        <Markdown value={"&nbsp;" + value} />
      </a>
    </div>
  );
}

const INDENTS: Record<
  1 | 2 | 3 | 4 | 5 | 6,
  { gutter: string; iconLeft: string }
> = {
  1: { gutter: "15px", iconLeft: "5px" },
  2: { gutter: "25px", iconLeft: "15px" },
  3: { gutter: "35px", iconLeft: "25px" },
  4: { gutter: "45px", iconLeft: "35px" },
  5: { gutter: "55px", iconLeft: "45px" },
  6: { gutter: "65px", iconLeft: "55px" },
};
