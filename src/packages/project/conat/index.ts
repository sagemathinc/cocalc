/*
Start the Conat services.
*/

import "./connection";
import { getLogger } from "@cocalc/project/logger";
import { init as initAPI } from "./api";
import { init as initWebsocketApi } from "./browser-websocket-api";
import { init as initRead } from "./files/read";
import { init as initWrite } from "./files/write";
import { init as initProjectStatus } from "@cocalc/project/project-status/server";
import { init as initUsageInfo } from "@cocalc/project/usage-info";
import { init as initJupyter } from "./jupyter";
import { init as initTerminalServer } from "./terminal-server";
import { getIdentity } from "./connection";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { init as initExecStream } from "@cocalc/project/exec-stream";

const logger = getLogger("project:conat:index");

export default async function init(opts?: {
  client?: ConatClient;
  compute_server_id?: number;
  project_id?: string;
}) {
  opts = getIdentity(opts);
  logger.debug("starting Conat project services", {
    project_id: opts.project_id,
    compute_server_id: opts.compute_server_id,
    address: opts.client?.options.address,
  });

  initTerminalServer(opts);
  await initAPI(opts);
  await initJupyter(opts);
  initWebsocketApi(opts);
  await initRead(opts);
  await initWrite(opts);
  initProjectStatus(opts);
  initUsageInfo(opts);
  initExecStream();
}
