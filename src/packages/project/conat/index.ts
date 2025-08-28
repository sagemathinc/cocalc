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
import { connectToConat } from "./connection";
import * as data from "@cocalc/project/data";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

const logger = getLogger("project:conat:index");

export default async function init({
  client = connectToConat(),
  compute_server_id = data.compute_server_id,
  project_id = data.project_id,
}: {
  client?: ConatClient;
  compute_server_id?: number;
  project_id?: string;
} = {}) {
  logger.debug("starting Conat project services", {
    project_id: project_id ?? data.project_id,
    compute_server_id: compute_server_id ?? data.compute_server_id,
    address: client.options.address,
  });

  await initAPI({ client, compute_server_id, project_id });
  await initJupyter();
  initWebsocketApi();
  await initRead();
  await initWrite();
  initProjectStatus();
  initUsageInfo();
}
