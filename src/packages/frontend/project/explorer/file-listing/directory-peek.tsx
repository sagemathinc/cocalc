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
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { useFileDrag } from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
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
}

interface PeekEntry extends DirectoryListingEntry {
  fullPath: string;
}

const MAX_HEIGHT = 300;

export default function DirectoryPeek({
  project_id,
  dirPath,
  onClose,
}: DirectoryPeekProps) {
  const intl = useIntl();
  const { actions } = useProjectContext();
  const computeServerId =
    useTypedRedux({ project_id }, "compute_server_id") ?? 0;
  const student = useStudentProjectFunctionality(project_id);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<PeekEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

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

        const files: PeekEntry[] = (result?.files ?? [])
          .filter((f) => f.name !== ".." && f.name !== ".")
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
  }, [dirPath, project_id, computeServerId]);

  function handleClick(entry: PeekEntry) {
    if (entry.isdir) {
      actions?.open_directory(entry.fullPath);
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
      fullPath: entry.fullPath,
      triggerFileAction: (action) => triggerFileAction(entry, action),
    });
  }

  function getIcon(entry: PeekEntry): IconName {
    if (entry.isdir) return "folder-open";
    const info = file_options(entry.name);
    return info?.icon ?? "file";
  }

  return (
    <div
      style={{
        borderLeft: `5px solid ${COLORS.ANTD_LINK_BLUE}`,
        background: COLORS.BLUE_LLLL,
        padding: "8px 8px 8px 12px",
        position: "relative",
        maxHeight: MAX_HEIGHT,
        overflowY: "auto",
      }}
    >
      {/* Close button */}
      <Button
        type="text"
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          zIndex: 1,
          color: COLORS.GRAY_M,
        }}
      >
        <Icon name="times" />
      </Button>

      {loading && (
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

      {!loading && entries.length > 0 && (
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
    </div>
  );
}

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
            width: 150,
            fontSize: 12,
            color: entry.isdir ? COLORS.ANTD_LINK_BLUE : COLORS.GRAY_D,
            background: "transparent",
            opacity: isDragging && !disableActions ? 0.4 : 1,
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
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.name}
          </span>
        </div>
      </Tooltip>
    </Dropdown>
  );
}
