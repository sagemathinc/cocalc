/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Hover-visible cut/copy/delete buttons for file rows.
// For files in the clipboard, only the active mode icon is visible;
// the other 3 buttons stay rendered but hidden to keep alignment stable.

import { Button, Modal, Space } from "antd";
import React, { useCallback } from "react";
import { useIntl } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { Icon, type IconName } from "@cocalc/frontend/components";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
// delete_files used by commented-out direct delete path
// import { delete_files } from "@cocalc/frontend/project/delete-files";
import { path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import type { ClipboardMode } from "./actions";
import {
  addRangeToClipboard,
  addToCopy,
  addToCut,
  // pasteHere, // used by commented-out handlePaste
  removeFile,
  removeFiles,
  signalFileAction,
} from "./actions";

interface QuickActionButtonsProps {
  project_id: string;
  path: string;
  isdir?: boolean;
  current_path?: string;
  hasClipboard: boolean;
  isInClipboard?: boolean;
  clipboardMode?: ClipboardMode;
  /** "small" for flyout, "middle" for explorer */
  btnSize?: "small" | "middle";
  /** "absolute" overlays on filename cell, "inline" is a flex item in the row */
  layout?: "absolute" | "inline";
  /** Full paths in display order — needed for shift-click range selection. */
  listingPaths?: string[];
  className?: string;
  compute_server_id?: number;
  style?: React.CSSProperties;
}

const BTN_STYLE_SMALL: React.CSSProperties = {
  padding: "0 4px",
  height: "20px",
  fontSize: "12px",
  color: COLORS.GRAY_M,
  transition: "none",
};

const BTN_STYLE_MIDDLE: React.CSSProperties = {
  padding: "0 6px",
  height: "24px",
  fontSize: "14px",
  color: COLORS.GRAY_M,
  transition: "none",
};

const INDICATOR_STYLE: React.CSSProperties = {
  background: COLORS.BLUE_LLL,
  color: COLORS.GRAY_DD,
  borderRadius: 3,
};

// Hidden but space-preserving
const HIDDEN: React.CSSProperties = { visibility: "hidden" };

export const QuickActionButtons: React.FC<QuickActionButtonsProps> = React.memo(
  ({
    project_id,
    path,
    isdir: _isdir, // used by commented-out handlePaste
    current_path,
    hasClipboard: _hasClipboard, // used by commented-out paste button
    isInClipboard,
    clipboardMode,
    btnSize = "small",
    layout = "absolute",
    listingPaths,
    className,
    compute_server_id,
    style,
  }) => {
    const intl = useIntl();
    const { tail: name } = path_split(path);
    const btnStyle = btnSize === "middle" ? BTN_STYLE_MIDDLE : BTN_STYLE_SMALL;

    // Which icon is the active clipboard indicator (null = none)
    const activeIcon: IconName | null =
      isInClipboard && clipboardMode
        ? clipboardMode === "cut"
          ? "scissors"
          : "copy"
        : null;

    const handleCut = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isInClipboard && clipboardMode === "cut") {
          removeFile(project_id, path);
        } else if (e.shiftKey) {
          addRangeToClipboard(project_id, path, "cut", listingPaths ?? []);
        } else {
          addToCut(project_id, path);
          redux
            .getProjectActions(project_id)
            ?.set_most_recent_file_click(path);
        }
      },
      [project_id, path, isInClipboard, clipboardMode, listingPaths],
    );

    const handleCopy = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isInClipboard && clipboardMode === "copy") {
          removeFile(project_id, path);
        } else if (e.shiftKey) {
          addRangeToClipboard(project_id, path, "copy", listingPaths ?? []);
        } else {
          addToCopy(project_id, path);
          redux
            .getProjectActions(project_id)
            ?.set_most_recent_file_click(path);
        }
      },
      [project_id, path, isInClipboard, clipboardMode, listingPaths],
    );

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const store = redux.getProjectStore(project_id);
        const checked = store?.get("checked_files");
        const allPaths = new Set(checked ? checked.toArray() : []);
        allPaths.add(path);
        const pathsArray = [...allPaths];
        const count = pathsArray.length;
        const displayName =
          count === 1 ? name : `${count} ${plural(count, "file")}`;
        Modal.confirm({
          title: intl.formatMessage(labels.delete_confirm_title, {
            name: displayName,
          }),
          content: intl.formatMessage(labels.delete_confirm_description, {
            name: displayName,
          }),
          okText: intl.formatMessage(labels.delete),
          okType: "danger",
          onOk: async () => {
            const actions = redux.getProjectActions(project_id);
            if (!actions) return;
            // Use ProjectActions.delete_files() for full side effects:
            // sandbox check, project-running check, activity logging, audit trail
            const ok = await actions.delete_files({
              paths: pathsArray,
              compute_server_id,
            });
            if (!ok) return; // blocked (sandbox, project not running, etc.)
            // Cleanup: remove from clipboard, close tabs, refresh listing
            removeFiles(
              pathsArray.map((p) => ({ project_id, path: p })),
            );
            for (const p of pathsArray) {
              actions.close_tab(p);
            }
            actions.set_all_files_unchecked();
            actions.fetch_directory_listing({ path: current_path });
            signalFileAction(project_id);
          },
        });
      },
      [project_id, path, name, compute_server_id, current_path, intl],
    );

    /* Paste handler — disabled for now, use the pill/banner instead
    const handlePaste = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const target = isdir ? path : (current_path ?? "");
        pasteHere(project_id, target, e.shiftKey).catch(() => {});
      },
      [project_id, path, isdir, current_path],
    );
    */

    if (IS_MOBILE) return null;

    // Helper: style for a button — visible with indicator bg if it's the
    // active clipboard icon, hidden if another icon is active, normal otherwise
    function btnStyleFor(iconName: IconName): React.CSSProperties {
      if (activeIcon === iconName) {
        return { ...btnStyle, ...INDICATOR_STYLE, visibility: "visible" };
      }
      if (activeIcon != null) {
        return { ...btnStyle, ...HIDDEN };
      }
      return btnStyle;
    }

    const absoluteStyle: React.CSSProperties = {
      position: "absolute",
      right: 0,
      top: "50%",
      transform: "translateY(-50%)",
      background: isInClipboard ? "transparent" : "inherit",
      paddingLeft: 4,
      ...(isInClipboard ? { visibility: "visible" as const } : style),
    };

    // Inline layout: zero-width anchor, buttons float left on hover
    const inlineStyle: React.CSSProperties = {
      flex: "0 0 0px",
      position: "relative",
      width: 0,
      overflow: "visible",
      ...(isInClipboard ? { visibility: "visible" as const } : {}),
    };

    // The button bar inside the inline layout is positioned absolutely,
    // anchored to the RIGHT edge so it expands leftward over content.
    const inlineBarStyle: React.CSSProperties = {
      position: "absolute",
      right: 0,
      top: "50%",
      transform: "translateY(-50%)",
      background: isInClipboard ? "transparent" : COLORS.BLUE_LLLL,
      borderRadius: 3,
      zIndex: 1,
    };

    return (
      <span
        className={isInClipboard ? undefined : className}
        style={layout === "inline" ? inlineStyle : absoluteStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <Space.Compact
          size={btnSize}
          style={layout === "inline" ? inlineBarStyle : undefined}
        >
          <Button
            type="text"
            size={btnSize}
            style={btnStyleFor("scissors")}
            onClick={handleCut}
            title={intl.formatMessage(labels.cut)}
          >
            <Icon name="scissors" />
          </Button>
          <Button
            type="text"
            size={btnSize}
            style={btnStyleFor("copy")}
            onClick={handleCopy}
            title={intl.formatMessage(labels.copy)}
          >
            <Icon name="copy" />
          </Button>
          {/* Paste button — disabled for now, use the pill/banner instead
          <Button
            type="text"
            size={btnSize}
            disabled={activeIcon == null && !hasClipboard}
            style={
              activeIcon != null
                ? { ...btnStyle, ...HIDDEN }
                : {
                    ...btnStyle,
                    color: hasClipboard ? COLORS.ANTD_GREEN_D : undefined,
                  }
            }
            onClick={handlePaste}
            title={intl.formatMessage(labels.paste_here)}
          >
            <Icon name="paste" />
          </Button>
          */}
          <Button
            type="text"
            size={btnSize}
            style={
              activeIcon != null
                ? { ...btnStyle, ...HIDDEN }
                : { ...btnStyle, color: COLORS.ANTD_RED }
            }
            onClick={handleDelete}
            title={intl.formatMessage(labels.delete)}
          >
            <Icon name="trash" />
          </Button>
        </Space.Compact>
      </span>
    );
  },
);
