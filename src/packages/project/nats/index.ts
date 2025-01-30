/*
Start the NATS servers:

- the new api
- legacy api
*/

import { getLogger } from "@cocalc/project/logger";
const logger = getLogger("project:nats:index");
import { init as initAPI } from "./api";
import { init as initWebsocketApi } from "./browser-websocket-api";

export default async function init() {
  logger.debug("starting NATS project servers");
  initAPI();
  initWebsocketApi();
}
