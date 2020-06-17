/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

import { Icon } from "../r_misc";
const { Well } = require("react-bootstrap");

export function NoNewNotifications({ text, style }) {
  return (
    <Well style={Object.assign({}, well_style, style)}>
      <Icon name={"bell"} size={"4x"} style={{ color: "#a3aab1" }} />
      <h3>{text}.</h3>
    </Well>
  );
}

const well_style: React.CSSProperties = {
  padding: "40px, 30px",
  textAlign: "center",
};
