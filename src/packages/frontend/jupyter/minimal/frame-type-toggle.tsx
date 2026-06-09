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
import { webapp_client } from "@cocalc/frontend/webapp-client";

const SHOW_TAGS = webapp_client.server_time() < new Date("2026-05-01");

const TAG_STYLE: React.CSSProperties = {
  fontSize: 10,
  padding: "0 4px",
  lineHeight: "16px",
  marginLeft: 2,
  marginRight: 0,
  verticalAlign: "super",
};

function hasFrameOfType(actions: any, type: string): boolean {
  const leafIds = actions._get_leaf_ids();
  for (const id in leafIds) {
    if (actions._get_frame_type(id) === type) {
      return true;
    }
  }
  return false;
}

function isMultiFrame(actions: any): boolean {
  return Object.keys(actions._get_leaf_ids()).length > 1;
}

export function SwitchToMinimalButton() {
  const { actions, id } = useFrameContext();

  if (isMultiFrame(actions) && hasFrameOfType(actions, "jupyter_minimal")) {
    return null;
  }

  return (
    <Tooltip title="Switch this notebook frame to minimal mode. You can switch back any time.">
      <Button
        type="text"
        size="small"
        onClick={() => actions.set_frame_type(id, "jupyter_minimal")}
      >
        Minimal
        {SHOW_TAGS && (
          <Tag color="blue" style={TAG_STYLE}>
            New
          </Tag>
        )}
      </Button>
    </Tooltip>
  );
}

export function SwitchToRegularButton() {
  const { actions, id } = useFrameContext();

  if (
    isMultiFrame(actions) &&
    hasFrameOfType(actions, "jupyter_cell_notebook")
  ) {
    return null;
  }

  return (
    <Tooltip title="Switch this notebook frame back to the regular Jupyter notebook view.">
      <Button
        type="text"
        size="small"
        onClick={() => actions.set_frame_type(id, "jupyter_cell_notebook")}
      >
        Regular
        {SHOW_TAGS && (
          <Tag
            style={{
              ...TAG_STYLE,
              color: "var(--cocalc-top-bar-text, #fff)",
              background: "var(--cocalc-top-bar-bg, #333)",
              borderColor: "var(--cocalc-top-bar-bg, #333)",
            }}
          >
            Old
          </Tag>
        )}
      </Button>
    </Tooltip>
  );
}
