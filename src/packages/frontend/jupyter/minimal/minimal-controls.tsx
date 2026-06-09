/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Segmented, Tooltip } from "antd";
import React from "react";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "@cocalc/frontend/components";


export type MinimalLayout = "centered" | "wide";

interface MinimalControlsProps {
  layout: MinimalLayout;
  zenMode: boolean;
  onLayoutChange: (layout: MinimalLayout) => void;
  onZenModeChange: (zen: boolean) => void;
}

export const MinimalControls: React.FC<MinimalControlsProps> = React.memo(
  ({ layout, zenMode, onLayoutChange, onZenModeChange }) => {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "2px 8px",
          borderBottom: `1px solid var(--cocalc-border-light, #e0e0e0)`,
          backgroundColor: `var(--cocalc-bg-elevated, #f5f5f5)`,
          flexShrink: 0,
        }}
      >
        <Segmented
          size="small"
          value={layout}
          onChange={(v) => onLayoutChange(v as MinimalLayout)}
          options={[
            {
              value: "centered",
              label: (
                <Tooltip title="Centered layout">
                  <Icon
                    name="pic-centered"
                    rotate="90"
                    style={{ fontSize: "14px" }}
                  />
                </Tooltip>
              ),
            },
            {
              value: "wide",
              label: (
                <Tooltip title="Full width">
                  <Icon
                    name="column-width"
                    style={{ fontSize: "14px" }}
                  />
                </Tooltip>
              ),
            },
          ]}
        />
        <Tooltip title={zenMode ? "Show code cells" : "Hide code cells"}>
          <Button
            bsSize="xsmall"
            active={zenMode}
            onClick={() => onZenModeChange(!zenMode)}
          >
            {zenMode ? "Zen" : "Code"}
          </Button>
        </Tooltip>
      </div>
    );
  },
);
