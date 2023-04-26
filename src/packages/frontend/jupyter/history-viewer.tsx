/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
History viewer for Jupyter notebooks
*/

import { fromJS, List, Map } from "immutable";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { Redux, useTypedRedux } from "../app-framework";
import { createRoot } from "react-dom/client";
import { path_split } from "@cocalc/util/misc";
import * as cell_utils from "./cell-utils";
import { CellList } from "./cell-list";
import { cm_options } from "./cm_options";
import { ErrorDisplay } from "../components";
import { ERROR_STYLE } from "./main";

function get_cells(
  syncdb: SyncDB,
  version?: Date
): { cells: Map<string, any>; cell_list: List<string> } {
  let cells = Map<string, any>();
  const othercells = syncdb.version(version).get({ type: "cell" });
  if (othercells != null) {
    othercells.forEach(
      (cell: any) => (cells = cells.set(cell.get("id"), cell))
    );
  }
  const cell_list = cell_utils.sorted_cell_list(cells);
  return { cells, cell_list };
}

interface HistoryViewerProps {
  syncdb: any; // syncdb object corresponding to a jupyter notebook
  version?: Date;
  font_size?: number;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({
  syncdb,
  version,
  font_size,
}) => {
  const default_font_size = useTypedRedux("account", "font_size") ?? 14;
  const project_id = syncdb.get_project_id();
  const { head: directory } = path_split(syncdb.get_path());
  const { cells, cell_list } = get_cells(syncdb, version);

  const options = fromJS({
    markdown: undefined,
    options: cm_options(),
  });

  const kernel_error = syncdb
    .version(version)
    .get_one({ type: "settings" })
    ?.get("kernel_error");

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
        cell_list={cell_list}
        cells={cells}
        font_size={font_size ?? default_font_size}
        mode="escape"
        cm_options={options}
        project_id={project_id}
        directory={directory}
        trust={false}
      />
    </div>
  );
};

// The following is just for integrating the history viewer.
import { export_to_ipynb } from "./export-to-ipynb";
import json_stable from "json-stable-stringify";

export async function to_ipynb(syncdb: SyncDB, version: Date): Promise<object> {
  return await export_to_ipynb(get_cells(syncdb, version));
}

export async function jupyter_history_viewer_jquery_shim(syncdb: SyncDB) {
  const elt = $("<div class='smc-vfill'></div>");
  const root = createRoot(elt[0]);
  return {
    element: elt,
    show() {
      elt.show();
    },
    hide() {
      elt.hide();
    },
    remove() {
      root.unmount();
    },
    set_version(version) {
      root.render(
        <Redux>
          <HistoryViewer syncdb={syncdb} version={version} />
        </Redux>
      );
    },
    async to_str(version) {
      const ipynb = await to_ipynb(syncdb, version);
      return json_stable(ipynb, { space: 1 });
    },
  };
}
