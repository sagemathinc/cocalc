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

export default async function run({
  project_id,
  path,
  input,
  id,
  set,
}: Opts): Promise<void> {
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
  return new Promise<void>((resolve) => {
    let finished = false;
    function onChange() {
      if (finished) return;
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
      const hasExecutionResult =
        cell.get("exec_count") != null || cell.get("output") != null;
      if (
        cell.get("state") == "done" &&
        cell.get("end") &&
        cell.get("end") != previousEnd &&
        hasExecutionResult
      ) {
        finished = true;
        store.removeListener("change", onChange);
        jupyter_actions.syncdb.save();
        resolve();
      }
    }
    store.on("change", onChange);
    jupyter_actions.clear_outputs([id], false);
    jupyter_actions.set_cell_input(id, input, false);
    jupyter_actions.run_code_cell(id);
    // If no kernel is configured, run_code_cell immediately sets the cell
    // to state "done" with a global error but without setting end, exec_count,
    // or cell-level output. The onChange handler would never detect completion,
    // so resolve immediately.
    const kernel = store.get("kernel");
    if (!kernel) {
      finished = true;
      store.removeListener("change", onChange);
      resolve();
      return;
    }
    onChange();
  });
}
