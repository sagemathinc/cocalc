/*
History viewer for Jupyter notebooks
*/

import * as immutable from "immutable";
import { React, Component, ReactDOM, Redux, redux } from "../app-framework"; // TODO: this will move
import { path_split } from "smc-util/misc";
const cell_utils = require("./cell-utils");
const { CellList } = require("./cell-list");
const { cm_options } = require("./cm_options");

const get_cells = function(syncdb, version) {
  let cells = immutable.Map<any, any>();
  const othercells = syncdb.version(version).get({ type: "cell" });
  if (othercells != null) {
    othercells.forEach((cell: any) => (cells = cells.set(cell.get("id"), cell)));
  }
  const cell_list = cell_utils.sorted_cell_list(cells);
  return { cells, cell_list };
};

interface HistoryViewerProps {
  syncdb: any; // syncdb object corresponding to a jupyter notebook
  version?: any;
}

export class HistoryViewer extends Component<HistoryViewerProps> {
  render_cells() {
    const project_id = this.props.syncdb.get_project_id();
    const { head: directory } = path_split(this.props.syncdb.get_path());
    const { cells, cell_list } = get_cells(this.props.syncdb, this.props.version);

    const options = immutable.fromJS({
      markdown: undefined,
      options: cm_options(),
    }); // TODO

    const account_store = redux.getStore("account") as any;
    let font_size = 14;
    if (account_store) {
      font_size = account_store.get("font_size", font_size);
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
        style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "hidden" }}
      >
        {this.render_cells()}
      </div>
    );
  }
}

// The following is just for integrating the history viewer.
const { export_to_ipynb } = require("./export-to-ipynb");
const json_stable = require("json-stable-stringify");

export function jupyter_history_viewer_jquery_shim(syncdb: any) {
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
        elt[0],
      );
    },
    to_str(version) {
      const ipynb = export_to_ipynb(get_cells(syncdb, version));
      return json_stable(ipynb, { space: 1 });
    },
  };
}
