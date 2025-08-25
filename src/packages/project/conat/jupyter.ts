/*

To run just this for a project in a console, from the browser, terminate the jupyter server by running this
in your browser with the project open:

    await cc.client.conat_client.projectApi(cc.current()).system.terminate({service:'jupyter'})

As explained in packages/project/conat/api/index.ts setup your environment as for the project.

Then run this code in nodejs:

    require("@cocalc/project/conat/jupyter").init()




*/

import { run } from "@cocalc/project/conat/api/jupyter";
import { outputHandler, getKernelStatus } from "@cocalc/jupyter/control";
import { jupyterServer } from "@cocalc/conat/project/jupyter/run-code";
import { connectToConat } from "@cocalc/project/conat/connection";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("project:conat:jupyter");

let server: any = null;
export function init() {
  logger.debug("initializing jupyter run server");
  const client = connectToConat();
  server = jupyterServer({
    client,
    project_id,
    compute_server_id,
    run,
    outputHandler,
    getKernelStatus,
  });
}

export function close() {
  logger.debug("closing jupyter run server");
  server?.close();
  server = null;
}
