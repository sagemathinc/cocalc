import { OutputHandler } from "@cocalc/jupyter/execute/output-handler";
import { type JupyterActions } from "./browser-actions";

export async function runCell({
  actions,
  id,
}: {
  actions: JupyterActions;
  id: string;
}) {
  const cell = actions.store.getIn(["cells", id])?.toJS();
  if (cell == null) {
    // nothing to do
    return;
  }
  cell.output = null;
  actions._set(cell);
  const handler = new OutputHandler({ cell });
  const api = await actions.conatApi();
  const mesgs = await api.editor.jupyterRun(actions.syncdbPath, [
    { id: cell.id, input: cell.input },
  ]);
  console.log(mesgs);
  for (const mesg of mesgs) {
    handler.process(mesg);
  }
  cell.state = "done";
  console.log(cell);
  actions._set(cell);
}
