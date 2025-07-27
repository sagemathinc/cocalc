import { jupyterRun } from "@cocalc/project/conat/api/editor";
import { outputHandler } from "@cocalc/jupyter/control";
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
    jupyterRun,
    outputHandler,
  });
}

export function close() {
  logger.debug("closing jupyter run server");
  server?.close();
  server = null;
}
