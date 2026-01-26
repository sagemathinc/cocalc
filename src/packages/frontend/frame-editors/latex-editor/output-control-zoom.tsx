/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Zoom Controls Component for LaTeX Editor Output Panel
Provides zoom in/out, zoom percentage selection, and fit width/height controls
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, InputNumber, Space } from "antd";
import { useCallback } from "react";
import { useIntl } from "react-intl";

import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon, Tip } from "@cocalc/frontend/components";
import {
  ZOOM_MESSAGES,
  ZOOM_PERCENTAGES,
} from "@cocalc/frontend/frame-editors/frame-tree/commands/const";
import { labels } from "@cocalc/frontend/i18n";

import { Actions } from "./actions";
import { CONTROL_BUTTON_PADDING } from "./output-control-pages";

const ZOOM_SNAP_TARGETS = ZOOM_PERCENTAGES.map((p) => p / 100);

interface ZoomControlsProps {
  actions: Actions;
  id: string;
  narrow?: boolean;
}

export function ZoomControls({ actions, id, narrow }: ZoomControlsProps) {
  const intl = useIntl();

  // Get current PDF zoom level (separate from font size)
  const currentPdfZoom =
    useRedux([actions.name, "local_view_state", id, "pdf_zoom"]) || 1.0;

  // Helper function to snap zoom to common levels if close, then clamp to bounds
  // Uses logarithmic snapping for better behavior across the zoom range
  function snapAndClampZoom(zoomLevel: number): number {
    // Clamp to reasonable bounds first
    const clampedZoom = Math.max(0.1, Math.min(10.0, zoomLevel));

    // Only snap if we're not already very close to a preset
    // This prevents "sticky" behavior when trying to zoom in/out from preset values
    const isCurrentlyAtPreset = ZOOM_SNAP_TARGETS.some(
      (target) => Math.abs(currentPdfZoom - target) < 0.01,
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

  // add some padding if now text is shown, otherwise the button is too small
  const btnStyle = narrow ? { padding: CONTROL_BUTTON_PADDING } : undefined;

  return (
    <Space.Compact role="region" aria-label="Zoom controls">
      <Tip title={intl.formatMessage(labels.zoom_in)} placement="top">
        <Button
          size="small"
          icon={<Icon name="search-plus" />}
          onClick={handleZoomIn}
          style={btnStyle}
          aria-label={intl.formatMessage(labels.zoom_in)}
        >
          {!narrow && intl.formatMessage(labels.zoom_in_short)}
        </Button>
      </Tip>

      <Tip title={intl.formatMessage(labels.zoom_out)} placement="top">
        <Button
          size="small"
          icon={<Icon name="search-minus" />}
          onClick={handleZoomOut}
          style={btnStyle}
          aria-label={intl.formatMessage(labels.zoom_out)}
        >
          {!narrow && intl.formatMessage(labels.zoom_out_short)}
        </Button>
      </Tip>

      <Dropdown
        menu={{ items: zoomMenuItems }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <Button
          size="small"
          aria-label={`Zoom: ${currentZoomPercentage}%`}
          aria-haspopup="menu"
        >
          {!narrow && `${currentZoomPercentage}%`}
          <Icon name="caret-down" />
        </Button>
      </Dropdown>
    </Space.Compact>
  );
}
