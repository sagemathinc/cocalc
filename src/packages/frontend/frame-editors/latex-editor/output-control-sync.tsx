/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sync Controls Component for LaTeX Editor Output Panel
Provides auto-sync toggle and manual sync functionality between source and PDF
*/

import { Button, Switch, Tooltip } from "antd";
import { useCallback, useEffect, useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import { useRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";

import { Actions } from "./actions";

export const AUTO_SYNC_TOOLTIP_MSG = defineMessage({
  id: "editor.latex.pdf_controls.auto_sync.tooltip",
  defaultMessage:
    "Auto-sync between source and PDF: cursor moves follow PDF scrolling, PDF scrolls to cursor position",
  description:
    "Tooltip explaining bidirectional auto-sync functionality in LaTeX PDF controls",
});

export const SYNC_HELP_MSG = {
  title: defineMessage({
    id: "editor.latex.pdf_controls.sync_help.title",
    defaultMessage: "LaTeX Sync Help",
    description: "Title for LaTeX sync help popup",
  }),
  content: defineMessage({
    id: "editor.latex.pdf_controls.sync_help.content",
    defaultMessage: `<p><strong>Manual Mode:</strong></p>
<ul>
  <li>Use ALT+Return in source document to jump to corresponding PDF location</li>
  <li>Double-click in PDF for inverse search to source</li>
</ul>
<p><strong>Automatic Mode:</strong></p>
<ul>
  <li>Syncs automatically from cursor changes in source to PDF</li>
  <li>Moving the PDF viewport moves the cursor in source</li>
</ul>
<p>This functionality uses SyncTeX to coordinate between LaTeX source and PDF output.</p>`,
    description:
      "Complete explanation of LaTeX sync functionality including manual and automatic modes",
  }),
};

interface SyncControlsProps {
  actions: Actions;
  id: string;
  viewportInfo?: {
    page: number;
    x: number;
    y: number;
  } | null;
  onClearViewportInfo?: () => void;
  pageDimensions?: { width: number; height: number }[];
  currentPage: number;
  narrow?: boolean;
}

export function SyncControls({
  actions,
  id,
  viewportInfo,
  onClearViewportInfo,
  pageDimensions = [],
  currentPage,
  narrow,
}: SyncControlsProps) {
  const intl = useIntl();

  // Auto-sync state (stored in local view state)
  const storedAutoSyncEnabled =
    useRedux([actions.name, "local_view_state", id, "autoSyncEnabled"]) ??
    false; // Default to false

  const [localAutoSyncEnabled, setLocalAutoSyncEnabled] = useState(
    storedAutoSyncEnabled,
  );

  // Check if auto sync is in progress
  const autoSyncInProgress =
    useRedux([actions.name, "autoSyncInProgress"]) ?? false;

  // Handle inverse sync (PDF → source)
  const handleViewportSync = useCallback(
    async (page: number, x: number, y: number) => {
      if (autoSyncInProgress) {
        return; // Prevent sync loops
      }

      try {
        await actions.synctex_pdf_to_tex(page, x, y);

        // Clear viewportInfo to prevent retriggering the sync loop
        if (onClearViewportInfo) {
          setTimeout(() => {
            onClearViewportInfo();
          }, 0);
        }
      } catch (error) {
        console.warn("Auto-sync reverse search failed:", error);
      }
    },
    [actions, autoSyncInProgress, onClearViewportInfo],
  );

  // Handle manual sync from middle of current page
  const handleManualSync = useCallback(() => {
    if (
      pageDimensions.length === 0 ||
      currentPage < 1 ||
      currentPage > pageDimensions.length
    ) {
      return; // No page dimensions available or invalid page
    }
    const pageDim = pageDimensions[currentPage - 1]; // pages are 1-indexed
    handleViewportSync(currentPage, pageDim.width / 2, pageDim.height / 2);
  }, [handleViewportSync, currentPage, pageDimensions]);

  // Sync state with stored values when they change
  useEffect(() => {
    setLocalAutoSyncEnabled(storedAutoSyncEnabled);
  }, [storedAutoSyncEnabled]);

  // Auto-sync effect when viewport changes and auto-sync is enabled
  useEffect(() => {
    if (localAutoSyncEnabled && viewportInfo && !autoSyncInProgress) {
      handleViewportSync(viewportInfo.page, viewportInfo.x, viewportInfo.y);
    }
  }, [
    localAutoSyncEnabled,
    viewportInfo,
    autoSyncInProgress,
    handleViewportSync,
  ]);

  const handleAutoSyncChange = (enabled: boolean) => {
    setLocalAutoSyncEnabled(enabled);
    // Save to local view state for persistence
    const local_view_state = actions.store.get("local_view_state");
    actions.setState({
      local_view_state: local_view_state.setIn(
        [id, "autoSyncEnabled"],
        enabled,
      ),
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {!narrow && <Icon name="exchange" />}
      <Tooltip title={intl.formatMessage(AUTO_SYNC_TOOLTIP_MSG)}>
        <Switch
          checked={localAutoSyncEnabled}
          onChange={handleAutoSyncChange}
          checkedChildren={intl.formatMessage(labels.on)}
          unCheckedChildren={intl.formatMessage(labels.off)}
        />
      </Tooltip>
      <Button
        type="text"
        size="small"
        style={{ fontSize: "13px", padding: "0 4px", height: "auto" }}
        onClick={handleManualSync}
        disabled={pageDimensions.length === 0}
      >
        Sync
      </Button>
      {!narrow && (
        <HelpIcon
          title={intl.formatMessage(SYNC_HELP_MSG.title)}
          placement="bottomLeft"
        >
          {intl.formatMessage(SYNC_HELP_MSG.content)}
        </HelpIcon>
      )}
    </div>
  );
}
