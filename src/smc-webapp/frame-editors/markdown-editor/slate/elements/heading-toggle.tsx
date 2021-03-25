/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "smc-webapp/app-framework";
import { Icon } from "smc-webapp/r_misc";

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
  compressed?: boolean;
}

export const HeadingToggle: React.FC<Props> = ({ compressed }) => {
  const toggle = () => {
    console.log("clicked on the toggle");
  };

  return (
    <span style={TOGGLE_STYLE}>
      <span style={{ float: "right" }}>
        <Icon
          name={compressed ? "chevron-right" : "chevron-down"}
          onClick={toggle}
        />
      </span>
    </span>
  );
};