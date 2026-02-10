/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
History viewer for Jupyter notebooks
*/

import { fromJS, List, Map } from "immutable";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { ErrorDisplay } from "@cocalc/frontend/components";
import * as cell_utils from "@cocalc/jupyter/util/cell-utils";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/consts/ui";
import { path_split } from "@cocalc/util/misc";
import { CellList } from "./cell-list";
import { cm_options } from "./cm_options";
import { ERROR_STYLE } from "./main";

function get_cells(doc): { cells: Map<string, any>; cell_list: List<string> } {
  let cells = Map<string, any>();
  const othercells = doc.get({ type: "cell" });
  if (othercells != null) {
    othercells.forEach(
      (cell: any) => (cells = cells.set(cell.get("id"), cell)),
    );
  }
  const cell_list = cell_utils.sorted_cell_list(cells);
  return { cells, cell_list };
}

export function HistoryViewer({ project_id, path, doc, font_size }) {
  const accountFontSize = useTypedRedux("account", "font_size");
  const default_font_size = font_size ?? accountFontSize ?? DEFAULT_FONT_SIZE;
  const { head: directory } = path_split(path);
  const { cells, cell_list } = get_cells(doc);

  const options = fromJS({
    markdown: undefined,
    options: cm_options(),
  });

  const kernel_error = doc.get_one({ type: "settings" })?.get("kernel_error");
  const actions = redux.getEditorActions(project_id, path)?.jupyter_actions;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "hidden",
      }}
    >
      {kernel_error && (
        <ErrorDisplay
          bsStyle="warning"
          error={kernel_error}
          style={ERROR_STYLE}
        />
      )}
      <CellList
        actions={actions}
        cell_list={cell_list}
        cells={cells}
        font_size={font_size ?? default_font_size}
        mode="escape"
        cm_options={options}
        project_id={project_id}
        directory={directory}
        trust={false}
        read_only={true}
      />
    </div>
  );
}

// The following is just for integrating the history viewer.
import { export_to_ipynb } from "@cocalc/jupyter/ipynb/export-to-ipynb";

export function to_ipynb(doc): object {
  const { cells, cell_list } = get_cells(doc);
  return export_to_ipynb({ cells: cells.toJS(), cell_list: cell_list.toJS() });
}
