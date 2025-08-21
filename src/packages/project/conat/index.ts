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

const logger = getLogger("project:conat:index");

export default async function init() {
  logger.debug("starting Conat project services");
  await initAPI();
  await initJupyter();
  initWebsocketApi();
  await initRead();
  await initWrite();
  initProjectStatus();
  initUsageInfo();
}
