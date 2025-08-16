/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getJupyterActions } from "./actions";

interface Opts {
  project_id: string;
  path: string;
  input: string;
  id: string;
  set: (object) => void;
}

export default async function run({ project_id, path, input, id, set }: Opts) {
  const jupyter_actions = await getJupyterActions({ project_id, path });
  const store = jupyter_actions.store;
  let cell = store.get("cells").get(id);
  if (cell == null) {
    // make new cell at the bottom of the notebook.
    const last_cell_id: string = store.get_cell_list().last();
    const pos = store.getIn(["cells", last_cell_id])?.get("pos", 0) + 1;
    jupyter_actions.insert_cell_at(pos, false, id);
  }
  const previousEnd = cell?.get("end");
  jupyter_actions.clear_outputs([id], false);
  jupyter_actions.set_cell_input(id, input, false);
  jupyter_actions.runCells([id]);
  function onChange() {
    const cell = store.get("cells").get(id);
    if (cell == null) return;

    set({
      output: cell.get("output")?.toJS(),
      runState: cell.get("state"),
      execCount: cell.get("exec_count"),
      kernel: cell.get("kernel"),
      start: cell.get("start"),
      end: cell.get("end"),
    });
    if (
      cell.get("state") == "done" &&
      cell.get("end") &&
      cell.get("end") != previousEnd
    ) {
      store.removeListener("change", onChange);
      // Useful for debugging since can then open the ipynb and see.
      // However, NOT needed normally.  We might even come up with
      // a way to make everything ephemeral...  On the other hand,
      // saving properly could be useful for output images in published docs, etc.
      jupyter_actions.syncdb.save();
    }
  }
  store.on("change", onChange);
}
