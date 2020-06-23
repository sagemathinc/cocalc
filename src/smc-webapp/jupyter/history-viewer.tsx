/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
History viewer for Jupyter notebooks
*/

import { fromJS, List, Map } from "immutable";

import { SyncDB } from "smc-util/sync/editor/db/sync";
import { React, Component, ReactDOM, Redux, redux } from "../app-framework";
import { path_split } from "smc-util/misc";
import * as cell_utils from "./cell-utils";
import { CellList } from "./cell-list";
import { cm_options } from "./cm_options";

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

export class HistoryViewer extends Component<HistoryViewerProps> {
  render_cells() {
    const project_id = this.props.syncdb.get_project_id();
    const { head: directory } = path_split(this.props.syncdb.get_path());
    const { cells, cell_list } = get_cells(
      this.props.syncdb,
      this.props.version
    );

    const options = fromJS({
      markdown: undefined,
      options: cm_options(),
    });

    let font_size = this.props.font_size;
    if (font_size == null) {
      const account_store = redux.getStore("account") as any;
      if (account_store != null) {
        font_size = account_store.get("font_size", font_size);
      }
      if (font_size == null) font_size = 14;
    }
    return (
      <CellList
        cell_list={cell_list}
        cells={cells}
        font_size={font_size}
        mode="escape"
        cm_options={options}
        project_id={project_id}
        directory={directory}
        trust={false}
      />
    );
  }

  render() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "hidden",
        }}
      >
        {this.render_cells()}
      </div>
    );
  }
}

// The following is just for integrating the history viewer.
import { export_to_ipynb } from "./export-to-ipynb";
import * as json_stable from "json-stable-stringify";

export function to_ipynb(syncdb: SyncDB, version: Date): object {
  return export_to_ipynb(get_cells(syncdb, version));
}

export function jupyter_history_viewer_jquery_shim(syncdb: SyncDB) {
  const elt = $("<div class='smc-vfill'></div>");
  return {
    element: elt,
    show() {
      return elt.show();
    },
    hide() {
      return elt.hide();
    },
    remove() {
      return ReactDOM.unmountComponentAtNode(elt[0]);
    },
    set_version(version) {
      return ReactDOM.render(
        <Redux>
          <HistoryViewer syncdb={syncdb} version={version} />
        </Redux>,
        elt[0]
      );
    },
    to_str(version) {
      const ipynb = to_ipynb(syncdb, version);
      return json_stable(ipynb, { space: 1 });
    },
  };
}
