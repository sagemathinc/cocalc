import { redux } from "@cocalc/frontend/app-framework";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { aux_file } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";

export async function run({
  project_id,
  path,
  input,
  id,
}: {
  project_id: string;
  path: string;
  input: string;
  id: string;
}) {
  const aux_path = aux_file(path, "ipynb");
  let actions = redux.getEditorActions(project_id, aux_path) as
    | JupyterEditorActions
    | undefined;
  if (actions == null) {
    const projectActions = redux.getProjectActions(project_id);
    //await projectActions.open_file({ path: aux_path, foreground: false });
    await projectActions.initFileRedux(aux_path);
    actions = redux.getEditorActions(project_id, aux_path) as
      | JupyterEditorActions
      | undefined;
  }
  if (actions == null) {
    throw Error("bug -- actions must be defined");
  }
  const { jupyter_actions } = actions;
  if (jupyter_actions.syncdb.get_state() != "ready") {
    await once(jupyter_actions.syncdb, "ready");
  }
  const store = jupyter_actions.store;
  let cell = store.get("cells").get(id);
  if (cell == null) {
    jupyter_actions.insert_cell_at(0, false, id);
  }
  jupyter_actions.set_cell_input(id, input, false);
  jupyter_actions.run_code_cell(id);
  window.x = { actions, id, aux_path, input };
}
