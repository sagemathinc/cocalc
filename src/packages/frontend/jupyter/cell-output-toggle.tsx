/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Components related to toggling the way output is displayed.

import React from "react";
import { Icon } from "../components/icon";
import type { JupyterActions } from "./browser-actions";
import { Button, Tooltip } from "antd";

const SCROLLED_STYLE: React.CSSProperties = {
  fontSize: "inherit",
  padding: 0,
  height: "auto",
  display: "flex",
  flexDirection: "column",
} as const;

const NORMAL_STYLE: React.CSSProperties = {
  borderColor: "transparent",
  ...SCROLLED_STYLE,
} as const;

interface OutputToggleProps {
  actions?: JupyterActions;
  id: string;
  scrolled?: boolean;
  children: React.ReactNode;
}

export const OutputToggle: React.FC<OutputToggleProps> = React.memo(
  ({ actions, id, scrolled, children }: OutputToggleProps) => {
    if (actions == null) {
      return null;
    }

    function toggle_scrolled() {
      actions?.toggle_output(id, "scrolled");
    }

    function collapse_output() {
      actions?.toggle_output(id, "collapsed");
    }

    const btn = (
      <Button
        type="text"
        style={scrolled ? SCROLLED_STYLE : NORMAL_STYLE}
        onClick={toggle_scrolled}
        onDoubleClick={collapse_output}
      >
        {children}
        <span style={{ flex: 1 }} />
      </Button>
    );

    return (
      <Tooltip
        title={
          <>
            Click{" "}
            <a onClick={toggle_scrolled}>
              to {scrolled ? "show" : "hide"} large output
            </a>
            .<br />
            Double click <a onClick={collapse_output}>to hide</a>.
          </>
        }
      >
        {btn}
      </Tooltip>
    );
  },
);

interface CollapsedOutputProps {
  actions?: JupyterActions;
  id: string;
}

export const CollapsedOutput: React.FC<CollapsedOutputProps> = React.memo(
  (props: CollapsedOutputProps) => {
    const { actions, id } = props;

    function show_output() {
      actions?.toggle_output(id, "collapsed");
    }

    return (
      <div style={{ textAlign: "center", width: "100%" }}>
        <Button
          onClick={show_output}
          type="text"
          size="small"
          style={{ color: "#666" }}
        >
          <Icon name="ColumnHeightOutlined" />
          Expand
        </Button>
      </div>
    );
  },
);
