/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Introspect -- display information related to help, source code,
etc., about a Jupyter notebook.  This is what appears as a pop-over
on the bottom half the of the screen for Jupyter classic.
*/

import { CSSProperties } from "react";
import { Map } from "immutable";
import { CellOutputMessage } from "../../../jupyter/output-messages/message";
import { useFrameRedux } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  font_size: number;
}

const STYLE: CSSProperties = {
  padding: "10px 25px 5px",
  overflowY: "auto",
};

const InnerStyle: CSSProperties = {
  border: "1px solid rgb(207, 207, 207)",
  borderRadius: "2px",
  background: "rgb(247, 247, 247)",
  padding: "5px 25px",
};

export function Introspect({ font_size }: Props) {
  const introspect: Map<string, any> = useFrameRedux(["introspect"]);

  function content() {
    if (introspect == null) return;
    const found = introspect.get("found");
    if (found != null && !found) {
      return <div>Nothing found</div>;
    }
    return <CellOutputMessage message={introspect} />;
  }

  return (
    <div style={STYLE}>
      <div style={{ ...InnerStyle, fontSize: font_size }}>{content()}</div>
    </div>
  );
}
