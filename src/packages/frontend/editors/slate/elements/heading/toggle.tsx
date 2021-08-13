/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { CSSProperties as CSS, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/r_misc/icon";
import { useSlate } from "../hooks";
import { Heading } from "./index";

const TOGGLE_STYLE = {
  cursor: "pointer",
  width: "1em",
  display: "inline-block",
  marginLeft: "-3em",
  paddingRight: "3em",
  color: "#666",
  fontSize: "12pt",
} as CSS;

interface Props {
  element: Heading;
}

export const HeadingToggle: React.FC<Props> = ({ element }) => {
  const editor = useSlate();
  const [collapsed, setCollapsed] = useState<boolean>(
    editor.collapsedSections.has(element)
  );

  useEffect(() => {
    // check this every time editor changes, e.g., when user uses
    // keyboard shortcut to change collapsedSections we have to
    // handle that here.  TODO:  editor.collapsedSections is not
    // in immer object, so we can't update only when it changes.
    if (!!editor.collapsedSections.get(element) !== collapsed) {
      setCollapsed(!collapsed);
    }
  }, [element, editor.ticks]);

  const toggle = () => {
    if (collapsed) {
      editor.collapsedSections.delete(element);
    } else {
      editor.collapsedSections.set(element, true);
    }
    setCollapsed(!collapsed);
    editor.updateHiddenChildren();
  };

  return (
    <span
      style={TOGGLE_STYLE}
      onClick={toggle}
      title={"Toggle collapse section (Control+Q)"}
    >
      <span style={{ float: "right" }}>
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
      </span>
    </span>
  );
};
