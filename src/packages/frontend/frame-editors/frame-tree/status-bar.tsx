/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more status information later, e.g.,
number of lines of the file...

This is basically used now as "ephemeral messages".
*/

import { CSSProperties } from "react";
import { Icon, Space } from "@cocalc/frontend/components";

const STYLE = {
  opacity: 0.85,
  position: "fixed",
  bottom: "0px",
  right: "0px",
  minWidth: "30%",
  zIndex: 100,
  border: "0.5px solid lightgray",
  borderRadius: "3px",
  color: "#666",
  padding: "0 5px",
  fontSize: "9pt",
  background: "#fff",
  boxShadow: "-2px -2px 2px #ccc",
} as CSSProperties;

interface Props {
  status: string;
  onClear: () => {};
}

export default function StatusBar({ status, onClear }: Props) {
  return (
    <div style={STYLE}>
      <Icon
        name="times"
        onClick={onClear}
        style={{ float: "right", marginTop: "2.5px" }}
      />
      {status}
      <Space />
    </div>
  );
}
