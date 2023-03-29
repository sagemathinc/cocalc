/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Components related to toggling the way output is displayed.

import React from "react";
import { Icon } from "../components/icon";
import type { JupyterActions } from "./browser-actions";
import { Button, Tooltip } from "antd";

const SCROLLED_STYLE: React.CSSProperties = {
  fontSize: "inherit",
  padding: 0,
  display: "flex", // flex used to move output prompt to bottom.
  flexDirection: "column",
  height: "auto",
  cursor: "pointer",
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
  (props: OutputToggleProps) => {
    const { actions, id, scrolled, children } = props;

    function toggle_scrolled() {
      actions?.toggle_output(id, "scrolled");
    }

    function collapse_output() {
      actions?.toggle_output(id, "collapsed");
    }

    return (
      <Tooltip title="Toggle whether large output is scrolled. Double click to hide.">
        <Button
          type="text"
          style={scrolled ? SCROLLED_STYLE : NORMAL_STYLE}
          onClick={toggle_scrolled}
          onDoubleClick={collapse_output}
        >
          {children}
          <div style={{ flex: 1 }} /> {/* use up all space */}
        </Button>
      </Tooltip>
    );
  }
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
  }
);
