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
  function onChange() {
    const cell = store.get("cells").get(id);
    if (cell == null) return;

    set({ state: cell.get("state"), output: cell.get("output")?.toJS() });
    if (cell.get("state") == "done") {
      store.removeListener("change", onChange);
    }
  }
  store.on("change", onChange);
}
