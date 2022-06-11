/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Insert a cell
*/

import { React } from "../app-framework";
const { IS_TOUCH } = require("../feature"); // TODO: use import with types
import { JupyterActions } from "./browser-actions";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

export interface InsertCellProps {
  actions: JupyterActions;
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
    const frameActions = useNotebookFrameActions();

    if (IS_TOUCH) {
      // TODO: Inserting cells via hover and click does not make sense
      // for a touch device, since no notion of hover, and is just confusing and results
      // in many false inserts.
      return <div style={{ height: "6px" }}></div>;
    }

    function click(e) {
      e.preventDefault();
      e.stopPropagation();
      const { actions, id, position } = props;
      if (frameActions.current == null) return;
      frameActions.current.set_cur_id(id);
      const new_id = frameActions.current.insert_cell(
        position === "below" ? 1 : -1
      );
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
        actions.set_cell_type(new_id, "markdown");
      }
    }

    return <div className="cocalc-jupyter-insert-cell" onClick={click} />;
  },
  should_memoize
);
