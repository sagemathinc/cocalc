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
import { getLogger } from "@cocalc/project/logger";
import { getIdentity } from "./connection";

const logger = getLogger("project:conat:jupyter");

let server: any = null;
export function init(opts?) {
  logger.debug("initializing jupyter run server");
  server = jupyterServer({
    ...getIdentity(opts),
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
