/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sync Controls Component for LaTeX Editor Output Panel
Provides auto-sync toggle buttons for bidirectional sync between source and PDF
*/

import { Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import { useRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon, Tip } from "@cocalc/frontend/components";
import { SYNC_FORWARD_ICON, SYNC_INVERSE_ICON } from "@cocalc/util/consts/ui";

import { Actions } from "./actions";

// Tweak it in such a way, that it looks consistent with ./*-pages.tsx up/down arrows
const CONTROL_BUTTON_PADDING = "0 8px";

const FORWARD_SYNC_TOOLTIP_MSG = defineMessage({
  id: "editor.latex.pdf_controls.forward_sync.tooltip",
  defaultMessage: "Auto-sync from source to PDF: cursor moves scroll the PDF",
  description:
    "Tooltip explaining forward auto-sync (CM → PDF) in LaTeX PDF controls",
});

const INVERSE_SYNC_TOOLTIP_MSG = defineMessage({
  id: "editor.latex.pdf_controls.inverse_sync.tooltip",
  defaultMessage:
    "Auto-sync from PDF to source: PDF scrolling moves the cursor",
  description:
    "Tooltip explaining inverse auto-sync (PDF → CM) in LaTeX PDF controls",
});

const SYNC_BUTTON_TOOLTIP_MSG = defineMessage({
  id: "editor.latex.pdf_controls.sync_button.tooltip",
  defaultMessage: "One-time inverse sync to the source editor",
  description: "Tooltip for manual sync button in LaTeX PDF controls",
});

const SYNC_HELP_MSG = {
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
  <li>Double-click in PDF or the "Sync" button for inverse search to source</li>
</ul>
<p><strong>Automatic Mode:</strong></p>
<ul>
  <li>Forward Sync (→): Syncs automatically from cursor changes in source to PDF</li>
  <li>Inverse Sync (←): Moving the PDF viewport moves the cursor in source</li>
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
  const storedAutoSyncForward =
    useRedux([actions.name, "local_view_state", id, "autoSyncForward"]) ??
    false;

  const storedAutoSyncInverse =
    useRedux([actions.name, "local_view_state", id, "autoSyncInverse"]) ??
    false;

  const [autoSyncForward, setAutoSyncForward] = useState(storedAutoSyncForward);

  const [autoSyncInverse, setAutoSyncInverse] = useState(storedAutoSyncInverse);

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
    setAutoSyncForward(storedAutoSyncForward);
  }, [storedAutoSyncForward]);

  useEffect(() => {
    setAutoSyncInverse(storedAutoSyncInverse);
  }, [storedAutoSyncInverse]);

  // Auto-sync effect when viewport changes and inverse auto-sync is enabled
  useEffect(() => {
    if (autoSyncInverse && viewportInfo && !autoSyncInProgress) {
      handleViewportSync(viewportInfo.page, viewportInfo.x, viewportInfo.y);
    }
  }, [autoSyncInverse, viewportInfo, autoSyncInProgress, handleViewportSync]);

  function handleAutoSyncChange(type: "autoSyncForward" | "autoSyncInverse") {
    const forward = type === "autoSyncForward";
    const enabled = !(forward ? autoSyncForward : autoSyncInverse);
    (forward ? setAutoSyncForward : setAutoSyncInverse)(enabled);
    const local_view_state = actions.store.get("local_view_state");
    actions.setState({
      local_view_state: local_view_state.setIn([id, type], enabled),
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <Space.Compact>
        <Tip
          title={intl.formatMessage(INVERSE_SYNC_TOOLTIP_MSG)}
          placement="top"
        >
          <BSButton
            active={autoSyncInverse}
            bsSize="xsmall"
            onClick={() => handleAutoSyncChange("autoSyncInverse")}
            style={{ padding: CONTROL_BUTTON_PADDING }}
          >
            <Icon unicode={SYNC_INVERSE_ICON} />
          </BSButton>
        </Tip>
        <Tip
          title={intl.formatMessage(FORWARD_SYNC_TOOLTIP_MSG)}
          placement="top"
        >
          <BSButton
            active={autoSyncForward}
            bsSize="xsmall"
            onClick={() => handleAutoSyncChange("autoSyncForward")}
            style={{ padding: CONTROL_BUTTON_PADDING }}
          >
            <Icon unicode={SYNC_FORWARD_ICON} />
          </BSButton>
        </Tip>
        <Tip
          title={intl.formatMessage(SYNC_BUTTON_TOOLTIP_MSG)}
          placement="top"
        >
          <BSButton
            bsSize="xsmall"
            style={{ padding: CONTROL_BUTTON_PADDING }}
            onClick={handleManualSync}
            disabled={pageDimensions.length === 0}
          >
            Sync
          </BSButton>
        </Tip>
      </Space.Compact>
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
