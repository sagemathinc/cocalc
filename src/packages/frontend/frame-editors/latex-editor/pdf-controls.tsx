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
import { Icon } from "@cocalc/frontend/components";
import {
  ZOOM_MESSAGES,
  ZOOM_PERCENTAGES,
} from "@cocalc/frontend/frame-editors/frame-tree/commands/generic-commands";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";

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

const autoSyncTooltipMessage = defineMessage({
  id: "editor.latex.pdf_controls.auto_sync.tooltip",
  defaultMessage:
    "Auto-sync between source and PDF: cursor moves follow PDF scrolling, PDF scrolls to cursor position",
  description:
    "Tooltip explaining bidirectional auto-sync functionality in LaTeX PDF controls",
});

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
}

export function PDFControls({
  actions,
  id,
  totalPages = 0,
  currentPage = 1,
  viewportInfo,
  onClearViewportInfo,
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

  // Check if sync is in progress
  const syncInProgress = useRedux([actions.name, "sync_in_progress"]) ?? false;

  // Handle inverse sync (PDF → source)
  const handleViewportSync = useCallback(
    async (page: number, x: number, y: number) => {
      if (syncInProgress) {
        return; // Prevent sync loops
      }

      // Set sync in progress flag (deferred to avoid React rendering conflicts)
      setTimeout(() => {
        actions.setState({ sync_in_progress: true });
      }, 0);

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
      } finally {
        // Clear sync in progress flag (deferred to avoid React rendering conflicts)
        setTimeout(() => {
          actions.setState({ sync_in_progress: false });
        }, 0);
      }
    },
    [actions, syncInProgress],
  );

  // Sync state with stored values when they change
  useEffect(() => {
    setLocalAutoSyncEnabled(storedAutoSyncEnabled);
  }, [storedAutoSyncEnabled]);

  // Auto-sync effect when viewport changes and auto-sync is enabled
  useEffect(() => {
    if (localAutoSyncEnabled && viewportInfo && !syncInProgress) {
      handleViewportSync(viewportInfo.page, viewportInfo.x, viewportInfo.y);
    }
  }, [localAutoSyncEnabled, viewportInfo, syncInProgress, handleViewportSync]);

  // Note: Page initialization is handled by the output component through actions.setPage
  // and page updates from PDF scrolling are handled through onPageInfo callback

  // Helper function to snap zoom to common levels if close, then clamp to bounds
  function snapAndClampZoom(zoomLevel: number): number {
    const snapTargets = [0.5, 1.0, 2.0];
    const snapThreshold = 0.05;

    // Check for snapping to common zoom levels
    for (const target of snapTargets) {
      if (Math.abs(zoomLevel - target) <= snapThreshold) {
        return target;
      }
    }

    // Otherwise clamp to reasonable bounds
    return Math.max(0.1, Math.min(10.0, zoomLevel));
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
      key: "auto-build",
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name={buildOnSave ? "check-square" : "square"} />
          Auto Build
        </div>
      ),
      onClick: toggleBuildOnSave,
    },
  ];

  const zoomMenuItems: MenuProps["items"] = [
    {
      key: "custom-zoom",
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {/* Build Controls */}
        <Dropdown.Button
          type="primary"
          size="small"
          icon={<Icon name="caret-down" />}
          menu={{ items: buildMenuItems }}
          trigger={["click"]}
          onClick={handleBuild}
        >
          <Icon name="play-circle" />
          Build
        </Dropdown.Button>

        {/* Auto-Sync Control */}
        <Tooltip title={intl.formatMessage(autoSyncTooltipMessage)}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Switch
              size="small"
              checked={localAutoSyncEnabled}
              onChange={handleAutoSyncChange}
            />
            <Icon name="exchange" />
            <span style={{ fontSize: "13px" }}>Sync</span>
          </div>
        </Tooltip>
      </div>

      {/* Right side page navigation */}
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

      {/* Zoom Controls - Overleaf Style */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
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
