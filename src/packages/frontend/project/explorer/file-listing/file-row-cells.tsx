/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Memoized row cells for the file listing table.
// Extracted from file-listing.tsx so each row only re-renders when its
// own props change (isChecked, isStarred, etc.), not when unrelated
// state like another file's checkbox changes.

import { Button, Checkbox } from "antd";
import React from "react";

import { Icon } from "@cocalc/frontend/components";
import type { ClipboardMode } from "@cocalc/frontend/file-clipboard/actions";
import { QuickActionButtons } from "@cocalc/frontend/file-clipboard/quick-actions";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import { COL_W } from "./consts";
import {
  renderFileIcon,
  renderFileName,
  renderTimestamp,
} from "./file-listing-utils";
import type { FileEntry } from "./types";

// ---------- Hoisted constants (avoid per-row allocation) ----------

export const CELL_STYLE: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "none",
  background: COLORS.WHITE,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

// ---------- Component ----------

export interface FileRowCellsProps {
  record: FileEntry;
  fp: string;
  isChecked: boolean;
  isStarred: boolean;
  isExpanded: boolean;
  isNarrow: boolean;
  dimFileExtensions: boolean;
  disableActions: boolean;
  handleCheckboxChange: (
    record: FileEntry,
    checked: boolean,
    e?: { shiftKey?: boolean },
  ) => void;
  handleToggleStar: (record: FileEntry, starred: boolean) => void;
  handleDownloadClick: (e: React.MouseEvent, record: FileEntry) => void;
  toggleExpandDir: (name: string, e: React.MouseEvent) => void;
  openContextMenu: (record: FileEntry, x: number, y: number) => void;
  actions: ProjectActions;
  project_id: string;
  current_path: string;
  hasClipboard: boolean;
  clipboardMode?: ClipboardMode;
  isInClipboard: boolean;
  listingPaths: string[];
  computeServerId?: number;
}

export const FileRowCells = React.memo(function FileRowCells({
  record,
  fp,
  isChecked,
  isStarred,
  isExpanded,
  isNarrow,
  dimFileExtensions,
  disableActions,
  handleCheckboxChange,
  handleToggleStar,
  handleDownloadClick,
  toggleExpandDir,
  openContextMenu,
  actions,
  project_id,
  current_path,
  hasClipboard,
  clipboardMode,
  isInClipboard,
  listingPaths,
  computeServerId,
}: FileRowCellsProps) {
  const [quickActionsMounted, setQuickActionsMounted] = React.useState(
    isChecked || isInClipboard,
  );
  const ensureQuickActionsMounted = React.useCallback(() => {
    setQuickActionsMounted(true);
  }, []);
  const showQuickActions =
    quickActionsMounted || isChecked || isInClipboard || IS_MOBILE;

  return (
    <>
      {!disableActions && (
        <td
          style={{ ...CELL_STYLE, width: COL_W.CHECKBOX }}
          onMouseEnter={ensureQuickActionsMounted}
        >
          <Checkbox
            checked={isChecked}
            disabled={record.name === ".."}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              handleCheckboxChange(record, e.target.checked, e.nativeEvent)
            }
          />
        </td>
      )}
      {!IS_MOBILE && (
        <td
          style={{
            ...CELL_STYLE,
            width: COL_W.TYPE,
            cursor: record.isdir ? "pointer" : undefined,
          }}
          className={isExpanded ? "cc-explorer-cell-expanded" : undefined}
          onMouseEnter={ensureQuickActionsMounted}
          onClick={
            record.isdir ? (e) => toggleExpandDir(record.name, e) : undefined
          }
        >
          {renderFileIcon(record, isExpanded)}
        </td>
      )}
      <td
        style={{ ...CELL_STYLE, width: COL_W.STAR }}
        onMouseEnter={ensureQuickActionsMounted}
      >
        <Icon
          name={isStarred ? "star-filled" : "star"}
          onClick={(e) => {
            e?.preventDefault();
            e?.stopPropagation();
            handleToggleStar(record, !isStarred);
          }}
          style={{
            cursor: "pointer",
            fontSize: "14pt",
            color: isStarred ? COLORS.STAR : COLORS.GRAY_L,
          }}
        />
      </td>
      <td
        style={{
          ...CELL_STYLE,
          width: COL_W.PUBLIC,
          cursor: record.is_public ? "pointer" : undefined,
        }}
        onMouseEnter={ensureQuickActionsMounted}
        onClick={
          record.is_public
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                actions.set_all_files_unchecked();
                actions.set_file_checked(fp, true);
                actions.set_file_action("share");
              }
            : undefined
        }
      >
        {record.is_public ? (
          <Icon name="share-square" style={{ color: COLORS.TAB }} />
        ) : null}
      </td>
      <td
        style={{ ...CELL_STYLE, position: "relative" }}
        onMouseEnter={ensureQuickActionsMounted}
      >
        {renderFileName(record, dimFileExtensions)}
        {!disableActions && record.name !== ".." && showQuickActions && (
          <QuickActionButtons
            project_id={project_id}
            path={fp}
            isdir={record.isdir}
            current_path={current_path}
            hasClipboard={hasClipboard}
            isInClipboard={isInClipboard}
            clipboardMode={clipboardMode}
            btnSize="middle"
            listingPaths={listingPaths}
            className="cc-explorer-hover-icon"
            compute_server_id={computeServerId}
            style={{
              background: isChecked ? COLORS.BLUE_LLL : COLORS.BLUE_LLLL,
            }}
          />
        )}
      </td>
      {!IS_MOBILE && (
        <td
          style={{ ...CELL_STYLE, width: COL_W.DATE }}
          onMouseEnter={ensureQuickActionsMounted}
        >
          {renderTimestamp(record.mtime)}
        </td>
      )}
      {!isNarrow && (
        <>
          <td
            style={{ ...CELL_STYLE, width: COL_W.SIZE, textAlign: "right" }}
            onMouseEnter={ensureQuickActionsMounted}
          >
            {!disableActions && (record.isdir ? record.size != null : true) ? (
              <Button
                type="text"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadClick(e, record);
                }}
                style={{
                  color: COLORS.TAB,
                  whiteSpace: "nowrap",
                  padding: "0 4px",
                  height: "auto",
                }}
              >
                <Icon
                  name="cloud-download"
                  className="cc-explorer-hover-icon"
                  style={{ color: COLORS.TAB, marginRight: 4 }}
                />
                {record.isdir
                  ? `${record.size} ${misc.plural(record.size, "item")}`
                  : misc.human_readable_size(record.size)}
              </Button>
            ) : (
              <span style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}>
                {record.isdir
                  ? record.size != null
                    ? `${record.size} ${misc.plural(record.size, "item")}`
                    : null
                  : misc.human_readable_size(record.size)}
              </span>
            )}
          </td>
          <td
            style={{
              ...CELL_STYLE,
              width: COL_W.ACTIONS,
              textAlign: "center",
            }}
            onMouseEnter={ensureQuickActionsMounted}
          >
            {record.name !== ".." && !disableActions && (
              <Button
                type="text"
                size="small"
                className="cc-explorer-hover-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  openContextMenu(record, e.clientX, e.clientY);
                }}
                style={{ color: COLORS.TAB }}
              >
                <Icon name="ellipsis" rotate="90" />
              </Button>
            )}
          </td>
        </>
      )}
    </>
  );
});

FileRowCells.displayName = "FileRowCells";
