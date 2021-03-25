/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, useState } from "smc-webapp/app-framework";
import { Icon } from "smc-webapp/r_misc";
import { useSlateStatic } from "./register";
import { Heading } from "./heading";

const TOGGLE_STYLE = {
  cursor: "pointer",
  width: "1em",
  display: "inline-block",
  marginLeft: "-1em",
  paddingRight: "10px",
  color: "#666",
  fontSize: "12pt",
} as CSS;

interface Props {
  element: Heading;
}

export const HeadingToggle: React.FC<Props> = ({ element }) => {
  const editor = useSlateStatic();
  const [collapsed, setCollapsed] = useState<boolean>(
    !!editor.collapsedSections.get(element)
  );

  const toggle = () => {
    editor.collapsedSections.set(element, !collapsed);
    setCollapsed(!collapsed);
    editor.updateHiddenChildren();
  };

  return (
    <span style={TOGGLE_STYLE} onClick={toggle}>
      <span style={{ float: "right" }}>
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
      </span>
    </span>
  );
};
