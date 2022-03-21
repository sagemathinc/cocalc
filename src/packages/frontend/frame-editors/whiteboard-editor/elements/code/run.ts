import { getJupyterActions } from "./actions";

export default async function run({
  project_id,
  path,
  input,
  id,
  set,
}: {
  project_id: string;
  path: string;
  input: string;
  id: string;
  set: (object) => void;
}) {
  const jupyter_actions = await getJupyterActions(project_id, path);
  const store = jupyter_actions.store;
  let cell = store.get("cells").get(id);
  if (cell == null) {
    jupyter_actions.insert_cell_at(0, false, id);
  }
  jupyter_actions.clear_outputs([id], false);
  jupyter_actions.set_cell_input(id, input, false);
  jupyter_actions.run_code_cell(id);
  //console.log("starting running ", id);
  //window.jupyter_actions = jupyter_actions;
  function onChange() {
    const cell = store.get("cells").get(id);
    //console.log("onChange", cell?.toJS());
    if (cell == null) return;

    set({ state: cell.get("state"), output: cell.get("output")?.toJS() });
    if (cell.get("state") == "done") {
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
