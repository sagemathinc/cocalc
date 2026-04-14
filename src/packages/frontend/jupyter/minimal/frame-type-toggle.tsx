/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Toggle buttons for switching between regular and minimal notebook frames.
 */

import { Button, Tag, Tooltip } from "antd";
import React from "react";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { COLORS } from "@cocalc/util/theme";

const TAG_STYLE: React.CSSProperties = {
  fontSize: 10,
  padding: "0 4px",
  lineHeight: "16px",
  marginLeft: 2,
  marginRight: 0,
  verticalAlign: "super",
};

export function SwitchToMinimalButton() {
  const { actions, id } = useFrameContext();

  return (
    <Tooltip title="Switch this notebook frame to minimal mode. You can switch back any time.">
      <Button
        type="text"
        size="small"
        onClick={() => actions.set_frame_type(id, "jupyter_minimal")}
      >
        Minimal
        <Tag color="blue" style={TAG_STYLE}>New</Tag>
      </Button>
    </Tooltip>
  );
}

export function SwitchToRegularButton() {
  const { actions, id } = useFrameContext();

  return (
    <Tooltip title="Switch this notebook frame back to the regular Jupyter notebook view.">
      <Button
        type="text"
        size="small"
        onClick={() => actions.set_frame_type(id, "jupyter_cell_notebook")}
      >
        Regular
        <Tag color={COLORS.GRAY_D} style={TAG_STYLE}>Old</Tag>
      </Button>
    </Tooltip>
  );
}
