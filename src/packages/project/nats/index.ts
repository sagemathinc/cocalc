/*
Start the NATS servers:

- the new api
- legacy api
*/

import { getLogger } from "@cocalc/project/logger";
import { init as initAPI } from "./api";
import { init as initOpenFiles } from "./open-files";
// TODO: initWebsocketApi is temporary
import { init as initWebsocketApi } from "./browser-websocket-api";

const logger = getLogger("project:nats:index");

export default async function init() {
  logger.debug("starting NATS project services");
  await initAPI();
  await initOpenFiles();
  initWebsocketApi();
}
