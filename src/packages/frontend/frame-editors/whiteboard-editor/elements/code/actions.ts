import { redux } from "@cocalc/frontend/app-framework";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { aux_file } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";
export type { JupyterActions };
import { reuseInFlight } from "async-await-utils/hof";

async function getJupyterActions0({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): Promise<JupyterActions> {
  const actions = await getJupyterFrameEditorActions({ project_id, path });
  const { jupyter_actions } = actions;
  if (jupyter_actions.syncdb.get_state() != "ready") {
    await once(jupyter_actions.syncdb, "ready");
  }
  return jupyter_actions;
}

// very important to debounce, since we create an event listener (via the once) above.
type F = (X: { project_id: string; path: string }) => Promise<JupyterActions>;
export const getJupyterActions: F = reuseInFlight(getJupyterActions0);

export async function getJupyterFrameEditorActions({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): Promise<JupyterEditorActions> {
  const aux_path = pathToIpynb(path);
  let actions = redux.getEditorActions(project_id, aux_path) as
    | JupyterEditorActions
    | undefined;
  if (actions == null) {
    const projectActions = redux.getProjectActions(project_id);
    await projectActions.initFileRedux(aux_path);
    actions = redux.getEditorActions(project_id, aux_path) as
      | JupyterEditorActions
      | undefined;
  }
  if (actions == null) {
    throw Error("bug -- actions must be defined");
  }
  return actions;
}

export function openJupyterNotebook({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): void {
  const aux_path = pathToIpynb(path);
  redux.getProjectActions(project_id).open_file({ path: aux_path });
}

export function pathToIpynb(pathToWhiteboard: string): string {
  return aux_file(pathToWhiteboard, "ipynb");
}

export async function getMode({ project_id, path }) {
  return (await getJupyterActions({ project_id, path })).store.get_cm_mode();
}
