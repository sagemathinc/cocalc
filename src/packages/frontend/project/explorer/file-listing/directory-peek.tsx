/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Inline "peek" into a directory shown as an expandable row in the
 * explorer table.  Fetches the listing directly (without changing
 * current_path) and renders compact file/folder chips in a flex-wrap
 * layout.  Click to open, right-click for context menu.
 */

import { Button, Dropdown, Flex, Spin, Tooltip } from "antd";
import type { MenuProps } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { VirtuosoGrid } from "react-virtuoso";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import {
  useFileDrag,
  useFolderDrop,
} from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import { buildFileActionItems } from "@cocalc/frontend/project/file-context-menu";
import { useProjectContext } from "@cocalc/frontend/project/context";
import type { FileAction } from "@cocalc/frontend/project_actions";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

interface DirectoryPeekProps {
  project_id: string;
  /** Full path of the directory to peek into */
  dirPath: string;
  /** Close the expanded row */
  onClose: () => void;
  /** Navigate the explorer to a directory (uses decoupled browsing path). */
  onNavigateDirectory?: (path: string) => void;
}

interface PeekEntry extends DirectoryListingEntry {
  fullPath: string;
}

const MAX_HEIGHT = 300;

/** Above this many entries we switch from a plain Flex to VirtuosoGrid
 *  so that 10k-file directories don't mount 10k DOM nodes at once. */
const VIRTUALIZE_THRESHOLD = 200;

/** Grid height when using VirtuosoGrid (accounts for header row + padding). */
const GRID_HEIGHT = MAX_HEIGHT - 48;

const PEEK_ITEM_WIDTH = 150;

/** Stable wrapper for VirtuosoGrid's list container — flex-wrap grid. */
const GridListContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => (
  <div
    ref={ref}
    {...props}
    style={{ ...props.style, display: "flex", flexWrap: "wrap", gap: 4 }}
  />
));
GridListContainer.displayName = "GridListContainer";

/** Memoized so parent re-renders (e.g. listing data change) don't
 *  unmount/remount the component and lose its fetched entries state.
 *  Only re-renders when project_id or dirPath actually changes. */
const DirectoryPeek = React.memo(function DirectoryPeek({
  project_id,
  dirPath,
  onClose,
  onNavigateDirectory,
}: DirectoryPeekProps) {
  const intl = useIntl();
  const { actions } = useProjectContext();
  const computeServerId =
    useTypedRedux({ project_id }, "compute_server_id") ?? 0;
  const showHidden = useTypedRedux({ project_id }, "show_hidden");
  const student = useStudentProjectFunctionality(project_id);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<PeekEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Delayed spinner: only show after 400ms to avoid flashing on quick
  // remounts (e.g. parent re-render after drop or periodic re-watch).
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (!loading || entries.length > 0) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), 400);
    return () => clearTimeout(timer);
  }, [loading, entries.length]);
  // Bumped whenever the listing service reports a change for dirPath,
  // causing the fetch effect below to re-run.
  const [version, setVersion] = useState(0);
  const dirPathRef = useRef(dirPath);
  dirPathRef.current = dirPath;

  // Watch dirPath for changes and bump version when it changes.
  // Re-register interest periodically (every 15s) to prevent expiry.
  useEffect(() => {
    const listings = redux
      .getProjectStore(project_id)
      ?.get_listings(computeServerId);
    if (!listings) return;
    listings.watch(dirPath);
    const interval = setInterval(() => listings.watch(dirPath), 15_000);
    const handleChange = (paths: string[]) => {
      if (paths.includes(dirPathRef.current)) {
        setVersion((v) => v + 1);
      }
    };
    listings.on("change", handleChange);
    return () => {
      clearInterval(interval);
      listings.removeListener("change", handleChange);
    };
  }, [project_id, computeServerId, dirPath]);

  // Fetch the directory listing; re-runs on dirPath change or version bump.
  // Only show loading spinner on first load (entries empty); refreshes are silent.
  useEffect(() => {
    let cancelled = false;

    async function fetchListing() {
      try {
        const result = await webapp_client.project_client.directory_listing({
          project_id,
          path: dirPath,
          hidden: true,
          compute_server_id: computeServerId,
        });
        if (cancelled) return;

        const raw = (result?.files ?? []).filter(
          (f) => f.name !== ".." && f.name !== ".",
        );

        // Apply file masks (dim compiled/derived files like .pyc, .aux, etc.)
        compute_file_masks(raw);

        const files: PeekEntry[] = raw
          // Hide dotfiles unless show_hidden is enabled
          .filter((f) => showHidden || !f.name.startsWith("."))
          .map((f) => ({
            ...f,
            fullPath: misc.path_to_file(dirPath, f.name),
          }));

        // Sort: directories first, then case-insensitive alphabetically
        files.sort((a, b) => {
          if (a.isdir && !b.isdir) return -1;
          if (!a.isdir && b.isdir) return 1;
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        });

        setEntries(files);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(`${err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchListing();
    return () => {
      cancelled = true;
    };
  }, [dirPath, project_id, computeServerId, version, showHidden]);

  function handleClick(entry: PeekEntry) {
    if (entry.isdir) {
      if (onNavigateDirectory) {
        onNavigateDirectory(entry.fullPath);
      } else {
        actions?.open_directory(entry.fullPath);
      }
    } else {
      actions?.open_file({ path: entry.fullPath });
    }
  }

  function triggerFileAction(entry: PeekEntry, action: FileAction) {
    actions?.set_all_files_unchecked();
    actions?.set_file_checked(entry.fullPath, true);
    actions?.set_file_action(action);
  }

  function getContextMenuItems(entry: PeekEntry): MenuProps["items"] {
    return buildFileActionItems({
      isdir: !!entry.isdir,
      intl,
      multiple: false,
      disableActions: student.disableActions,
      inSnapshots: dirPath.startsWith(".snapshots"),
      fullPath: entry.fullPath,
      triggerFileAction: (action) => triggerFileAction(entry, action),
    });
  }

  function getIcon(entry: PeekEntry): IconName {
    if (entry.isdir) return "folder-open";
    const info = file_options(entry.name);
    return info?.icon ?? "file";
  }

  const { dropRef: peekDropRef } = useFolderDrop(
    `explorer-peek-${dirPath}`,
    dirPath,
  );

  const isLarge = entries.length > VIRTUALIZE_THRESHOLD;

  return (
    <div
      ref={peekDropRef}
      data-folder-drop-path={dirPath}
      style={{
        borderLeft: `5px solid var(--cocalc-primary, ${COLORS.ANTD_LINK_BLUE})`,
        background: "var(--cocalc-bg-hover, #e6f4ff)",
        padding: "8px 8px 8px 12px",
        position: "relative",
        // When virtualized, VirtuosoGrid handles its own scrolling.
        ...(isLarge
          ? { overflow: "hidden" }
          : { maxHeight: MAX_HEIGHT, overflowY: "auto" }),
      }}
    >
      {/* Close button — flow layout for large dirs (avoids scrollbar overlap),
          absolute positioning for small dirs where it works fine. */}
      <div
        style={
          isLarge
            ? {
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 4,
                marginBottom: 4,
              }
            : {
                position: "absolute",
                top: 4,
                right: 4,
                zIndex: 1,
              }
        }
      >
        {isLarge && (
          <span style={{ fontSize: 11, color: COLORS.GRAY_M }}>
            {entries.length.toLocaleString()} items
          </span>
        )}
        <Button
          type="text"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{ color: COLORS.GRAY_M }}
        >
          <Icon name="times" />
        </Button>
      </div>

      {showSpinner && (
        <div style={{ textAlign: "center", padding: 12 }}>
          <Spin size="small" />
        </div>
      )}

      {error && (
        <div style={{ color: COLORS.ANTD_RED, fontSize: 12 }}>
          Error loading directory: {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div
          style={{ color: COLORS.GRAY_M, fontSize: 12, fontStyle: "italic" }}
        >
          Empty directory
        </div>
      )}

      {entries.length > 0 && !isLarge && (
        <Flex wrap gap="small">
          {entries.map((entry) => (
            <PeekItem
              key={entry.name}
              entry={entry}
              icon={getIcon(entry)}
              project_id={project_id}
              onClick={() => handleClick(entry)}
              contextMenuItems={getContextMenuItems(entry)}
              disableActions={student.disableActions}
            />
          ))}
        </Flex>
      )}

      {entries.length > 0 && isLarge && (
        <VirtuosoGrid
          style={{ height: GRID_HEIGHT }}
          totalCount={entries.length}
          overscan={300}
          components={{ List: GridListContainer }}
          itemContent={(index) => {
            const entry = entries[index];
            return (
              <PeekItem
                entry={entry}
                icon={getIcon(entry)}
                project_id={project_id}
                onClick={() => handleClick(entry)}
                contextMenuItems={getContextMenuItems(entry)}
                disableActions={student.disableActions}
              />
            );
          }}
        />
      )}
    </div>
  );
}, arePropsEqual);

// onClose is excluded intentionally — it must be stabilized with useCallback
// in the parent (FileListing) and does not affect render output.
function arePropsEqual(
  prev: Readonly<DirectoryPeekProps>,
  next: Readonly<DirectoryPeekProps>,
): boolean {
  return prev.project_id === next.project_id && prev.dirPath === next.dirPath;
}

export default DirectoryPeek;

// Individual file/folder chip in the peek

function PeekItem({
  entry,
  icon,
  project_id,
  onClick,
  contextMenuItems,
  disableActions,
}: {
  entry: PeekEntry;
  icon: IconName;
  project_id: string;
  onClick: () => void;
  contextMenuItems: MenuProps["items"];
  disableActions?: boolean;
}) {
  const { dragRef, dragListeners, dragAttributes, isDragging } = useFileDrag(
    `peek-${entry.fullPath}`,
    [entry.fullPath],
    project_id,
  );

  return (
    <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
      <Tooltip title={entry.name} mouseEnterDelay={0.5}>
        <div
          ref={dragRef}
          {...(disableActions ? {} : dragListeners)}
          {...(disableActions ? {} : dragAttributes)}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            cursor: "pointer",
            width: PEEK_ITEM_WIDTH,
            fontSize: 12,
            color: entry.isdir ? COLORS.ANTD_LINK_BLUE : COLORS.GRAY_D,
            background: "transparent",
            opacity:
              isDragging && !disableActions ? 0.4 : entry.mask ? 0.65 : 1,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = COLORS.GRAY_LLL;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <Icon
            name={icon}
            style={{
              fontSize: 12,
              flexShrink: 0,
              color: entry.isdir ? COLORS.FILE_ICON : undefined,
            }}
          />
          <PeekFileName name={entry.name} isdir={entry.isdir} />
        </div>
      </Tooltip>
    </Dropdown>
  );
}

/** Renders filename with dimmed extension, matching the main explorer listing. */
function PeekFileName({ name, isdir }: { name: string; isdir?: boolean }) {
  if (isdir) {
    return (
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    );
  }
  const parts = misc.separate_file_extension(name);
  return (
    <span
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {parts.name}
      {parts.ext ? (
        <span style={{ color: COLORS.FILE_DIMMED }}>.{parts.ext}</span>
      ) : null}
    </span>
  );
}
