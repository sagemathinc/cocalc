/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
PDF Controls Component for LaTeX Editor Output Panel
Provides zoom controls, page navigation, and other PDF viewing controls
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, InputNumber, Space, Switch, Tooltip } from "antd";
import { useCallback, useEffect, useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import { set_account_table } from "@cocalc/frontend/account/util";
import { useRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon } from "@cocalc/frontend/components";
import { COMMANDS } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import {
  BUILD_ON_SAVE_ICON_DISABLED,
  BUILD_ON_SAVE_ICON_ENABLED,
  BUILD_ON_SAVE_LABEL,
  ZOOM_MESSAGES,
  ZOOM_PERCENTAGES,
} from "@cocalc/frontend/frame-editors/frame-tree/commands/generic-commands";
import { editor, IntlMessage, labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";

const ZOOM_SNAP_TARGETS = ZOOM_PERCENTAGES.map((p) => p / 100);

const CONTROL_STYLE = {
  padding: "5px 10px",
  borderBottom: `1px solid ${COLORS.GRAY_L}`,
  background: COLORS.GRAY_LL,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "10px",
} as const;

const CONTROL_PAGE_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "13px",
  color: COLORS.GRAY_M,
} as const;

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

interface PDFControlsProps {
  actions: Actions;
  id: string;
  totalPages?: number;
  currentPage?: number;
  viewportInfo?: {
    page: number;
    x: number;
    y: number;
  } | null;
  onClearViewportInfo?: () => void;
  pageDimensions?: { width: number; height: number }[];
}

export function PDFControls({
  actions,
  id,
  totalPages = 0,
  currentPage = 1,
  viewportInfo,
  onClearViewportInfo,
  pageDimensions = [],
}: PDFControlsProps) {
  const intl = useIntl();

  // Get current PDF zoom level (separate from font size)
  const currentPdfZoom =
    useRedux([actions.name, "local_view_state", id, "pdf_zoom"]) || 1.0;

  // Get stored current page from local view state, fallback to prop
  const storedCurrentPage =
    useRedux([actions.name, "local_view_state", id, "currentPage"]) ??
    currentPage;

  // Get build on save setting from account store
  const buildOnSave =
    useRedux(["account", "editor_settings", "build_on_save"]) ?? false;

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
      storedCurrentPage < 1 ||
      storedCurrentPage > pageDimensions.length
    ) {
      return; // No page dimensions available or invalid page
    }
    const pageDim = pageDimensions[storedCurrentPage - 1]; // pages are 1-indexed
    handleViewportSync(
      storedCurrentPage,
      pageDim.width / 2,
      pageDim.height / 2,
    );
  }, [handleViewportSync, storedCurrentPage, pageDimensions]);

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

  // Note: Page initialization is handled by the output component through actions.setPage
  // and page updates from PDF scrolling are handled through onPageInfo callback

  // Helper function to snap zoom to common levels if close, then clamp to bounds
  // Uses logarithmic snapping for better behavior across the zoom range
  function snapAndClampZoom(zoomLevel: number): number {
    // Clamp to reasonable bounds first
    const clampedZoom = Math.max(0.1, Math.min(10.0, zoomLevel));

    // Only snap if we're not already very close to a preset
    // This prevents "sticky" behavior when trying to zoom in/out from preset values
    const isCurrentlyAtPreset = ZOOM_SNAP_TARGETS.some(target =>
      Math.abs(currentPdfZoom - target) < 0.01
    );

    if (isCurrentlyAtPreset) {
      // If currently at a preset, require a larger change to escape the snap zone
      const escapeThreshold = currentPdfZoom * 0.15; // 15% change required to escape
      if (Math.abs(clampedZoom - currentPdfZoom) < escapeThreshold) {
        return clampedZoom; // Don't snap, allow free movement
      }
    }

    // Use logarithmic snapping - more sensitive at lower values, less at higher values
    // Convert zoom level to log space for distance calculation
    const logZoom = Math.log(clampedZoom);

    // Check for snapping to common zoom levels using logarithmic distance
    let bestTarget = clampedZoom;
    let minLogDistance = Infinity;

    for (const target of ZOOM_SNAP_TARGETS) {
      const logTarget = Math.log(target);
      const logDistance = Math.abs(logZoom - logTarget);

      // Logarithmic snap threshold - adjusts based on zoom level
      // Smaller threshold at lower zoom levels, larger at higher levels
      const logThreshold = Math.log(1 + Math.min(target, clampedZoom) * 0.05);

      if (logDistance <= logThreshold && logDistance < minLogDistance) {
        minLogDistance = logDistance;
        bestTarget = target;
      }
    }

    return bestTarget;
  }

  // Helper method to set PDF zoom level
  const setPdfZoom = useCallback(
    (zoomLevel: number) => {
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state.setIn([id, "pdf_zoom"], zoomLevel),
      });
      // Trigger save to localStorage
      actions.save_local_view_state();
    },
    [actions, id],
  );

  const handleZoomIn = () => {
    // Increase PDF zoom by 10% increments with snapping to 100%
    const proposedZoom = currentPdfZoom * 1.1;
    const finalZoom = snapAndClampZoom(proposedZoom);
    setPdfZoom(finalZoom);
  };

  const handleZoomOut = () => {
    // Decrease PDF zoom by 10% decrements with snapping to 100%
    const proposedZoom = currentPdfZoom / 1.1;
    const finalZoom = snapAndClampZoom(proposedZoom);
    setPdfZoom(finalZoom);
  };

  const handleZoomWidth = () => {
    actions.zoom_page_width(id);
  };

  const handleZoomHeight = () => {
    actions.zoom_page_height(id);
  };

  const handleZoomPercentage = (percentage: number) => {
    // Convert percentage to zoom level (100% = 1.0 zoom)
    const newZoom = percentage / 100;
    setPdfZoom(newZoom);
  };

  // Calculate current zoom percentage based on PDF zoom level
  const currentZoomPercentage = Math.round(currentPdfZoom * 100);

  const flipPage = (direction: 1 | -1) => {
    const newPage =
      direction === 1
        ? Math.min(totalPages, storedCurrentPage + 1)
        : Math.max(1, storedCurrentPage - 1);

    if (newPage !== storedCurrentPage) {
      // Save to local view state for persistence
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state.setIn([id, "currentPage"], newPage),
      });
      // Also call setPage on parent frame
      actions.setPage(id, newPage);
    }
  };

  const handleBuild = () => {
    actions.build();
  };

  const handleForceBuild = () => {
    actions.force_build();
  };

  const handleClean = () => {
    actions.clean();
  };

  const toggleBuildOnSave = () => {
    set_account_table({ editor_settings: { build_on_save: !buildOnSave } });
  };

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

  const buildMenuItems: MenuProps["items"] = [
    {
      key: "force-build",
      label: "Force Build",
      icon: <Icon name="play-circle" />,
      onClick: handleForceBuild,
    },
    {
      key: "clean",
      label: "Clean",
      icon: <Icon name="trash" />,
      onClick: handleClean,
    },
    {
      type: "divider",
    },
    {
      key: "download-pdf",
      label: intl.formatMessage(COMMANDS.download_pdf.label as IntlMessage),
      icon: <Icon name="cloud-download" />,
      onClick: () => actions.download_pdf(),
    },
    {
      key: "print",
      label: intl.formatMessage(COMMANDS.print.label as IntlMessage),
      icon: <Icon name="print" />,
      onClick: () => actions.print(id),
    },
    {
      type: "divider",
    },
    {
      key: "auto-build",
      icon: (
        <Icon
          name={
            buildOnSave
              ? BUILD_ON_SAVE_ICON_ENABLED
              : BUILD_ON_SAVE_ICON_DISABLED
          }
        />
      ),
      label: intl.formatMessage(BUILD_ON_SAVE_LABEL, { enabled: buildOnSave }),
      onClick: toggleBuildOnSave,
    },
  ];

  const zoomMenuItems: MenuProps["items"] = [
    {
      key: "custom-zoom",
      label: (
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          <InputNumber
            size="small"
            style={{ width: "80px" }}
            value={currentZoomPercentage}
            min={10}
            max={1000}
            formatter={(value) => `${value}%`}
            parser={(value) => value?.replace("%", "") as any}
            onChange={(value) => {
              if (value) {
                handleZoomPercentage(value);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          />
        </div>
      ),
      onClick: (e) => {
        e.domEvent.stopPropagation();
      },
    },
    {
      type: "divider",
    },
    {
      key: "fit-width",
      label: intl.formatMessage(ZOOM_MESSAGES.zoomPageWidth.title),
      icon: <Icon name="column-width" />,
      onClick: handleZoomWidth,
    },
    {
      key: "fit-height",
      label: intl.formatMessage(ZOOM_MESSAGES.zoomPageHeight.title),
      icon: <Icon name="column-height" />,
      onClick: handleZoomHeight,
    },
    {
      type: "divider",
    },
    ...ZOOM_PERCENTAGES.map((percentage) => ({
      key: `zoom-${percentage}`,
      label: `${percentage}%`,
      onClick: () => handleZoomPercentage(percentage),
    })),
  ];

  return (
    <div style={CONTROL_STYLE}>
      {/* Left side controls */}
      {/* Build Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <Dropdown.Button
          type="primary"
          size="small"
          icon={<Icon name="caret-down" />}
          menu={{ items: buildMenuItems }}
          trigger={["click"]}
          onClick={handleBuild}
        >
          <Icon name="play-circle" />
          {intl.formatMessage(editor.build_control_and_log_title_short)}
        </Dropdown.Button>
      </div>

      {/* middle: page navigation */}
      {totalPages > 0 && (
        <div style={CONTROL_PAGE_STYLE}>
          <InputNumber
            size="small"
            style={{
              width: "7ex",
              fontSize: "13px",
            }}
            step={-1}
            value={storedCurrentPage}
            onChange={(page: number | null) => {
              if (!page) return;

              if (page <= 1) {
                page = 1;
              }
              if (page >= totalPages) {
                page = totalPages;
              }

              // Save to local view state for persistence
              const local_view_state = actions.store.get("local_view_state");
              actions.setState({
                local_view_state: local_view_state.setIn(
                  [id, "currentPage"],
                  page,
                ),
              });

              // Also call setPage on parent frame for any other components that need it
              actions.setPage(id, page);
            }}
          />{" "}
          / {totalPages}
          <Space.Compact>
            <Tooltip title="Previous Page">
              <Button
                size="small"
                icon={<Icon name="arrow-up" />}
                onClick={() => flipPage(-1)}
                disabled={storedCurrentPage <= 1}
              />
            </Tooltip>

            <Tooltip title="Next Page">
              <Button
                size="small"
                icon={<Icon name="arrow-down" />}
                onClick={() => flipPage(1)}
                disabled={storedCurrentPage >= totalPages}
              />
            </Tooltip>
          </Space.Compact>
        </div>
      )}

      {/* Auto-Sync Control */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <Icon name="exchange" />
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
        <HelpIcon
          title={intl.formatMessage(SYNC_HELP_MSG.title)}
          placement="bottomLeft"
        >
          {intl.formatMessage(SYNC_HELP_MSG.content)}
        </HelpIcon>
      </div>

      {/* Zoom Controls - Overleaf Style */}
      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
        <Space.Compact>
          <Tooltip title={intl.formatMessage(labels.zoom_in)}>
            <Button
              size="small"
              icon={<Icon name="search-plus" />}
              onClick={handleZoomIn}
            >
              {intl.formatMessage(labels.zoom_in_short)}
            </Button>
          </Tooltip>

          <Tooltip title={intl.formatMessage(labels.zoom_out)}>
            <Button
              size="small"
              icon={<Icon name="search-minus" />}
              onClick={handleZoomOut}
            >
              {intl.formatMessage(labels.zoom_out_short)}
            </Button>
          </Tooltip>

          <Dropdown
            menu={{ items: zoomMenuItems }}
            trigger={["click"]}
            placement="bottomRight"
          >
            <Button size="small">
              {currentZoomPercentage}%
              <Icon name="caret-down" />
            </Button>
          </Dropdown>
        </Space.Compact>
      </div>
    </div>
  );
}
