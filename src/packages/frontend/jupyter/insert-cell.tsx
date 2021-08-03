/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Insert a cell
*/

import { React, useState } from "../app-framework";

const { IS_TOUCH } = require("../feature"); // TODO: use import with types

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

export interface InsertCellProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  id: string;
  position?: "above" | "below";
}

export interface InsertCellState {
  hover: boolean;
}

function should_memoize(prev, next) {
  return next.id == prev.id && next.position == prev.position;
}

export const InsertCell: React.FC<InsertCellProps> = React.memo(
  (props: InsertCellProps) => {
    const { actions, frame_actions, id, position } = props;

    const [hover, set_hover] = useState<boolean>(false);

    function click(e: any) {
      frame_actions.set_cur_id(id);
      const new_id = frame_actions.insert_cell(position === "below" ? 1 : -1);
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
        actions.set_cell_type(new_id, "markdown");
      }
      set_hover(false);
    }

    const style: React.CSSProperties = { height: "6px", paddingBottom: "6px" };
    if (IS_TOUCH) {
      // TODO: Inserting cells via hover and click does not make sense
      // for a touch device, since no notion of hover, and is just confusing and results
      // in many false inserts.
      return <div style={style} />;
    }
    if (hover) {
      style.backgroundColor = "#428bca";
    }
    return (
      <div
        style={style}
        onClick={click}
        onMouseEnter={() => set_hover(true)}
        onMouseLeave={() => set_hover(false)}
      />
    );
  },
  should_memoize
);
