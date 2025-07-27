import { OutputHandler } from "@cocalc/jupyter/execute/output-handler";
import { type JupyterActions } from "./browser-actions";
import { jupyterClient } from "@cocalc/conat/project/jupyter/run-code";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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

  if (actions.jupyterClient == null) {
    // [ ] **TODO: Must invalidate this when compute server changes!!!!!**
    // and
    const compute_server_id = await actions.getComputeServerId();
    actions.jupyterClient = jupyterClient({
      path: actions.syncdbPath,
      client: webapp_client.conat_client.conat(),
      project_id: actions.project_id,
      compute_server_id,
    });
  }
  const client = actions.jupyterClient;
  if (client == null) {
    throw Error("bug");
  }

  cell.output = null;
  actions._set(cell);
  const handler = new OutputHandler({ cell });
  const runner = await client.run([cell]);
  for await (const mesgs of runner) {
    for (const mesg of mesgs) {
      handler.process(mesg);
      actions._set(cell, false);
    }
  }
  cell.state = "done";
  actions._set(cell, true);
}
