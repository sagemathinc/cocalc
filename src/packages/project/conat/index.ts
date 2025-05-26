/*
Start the NATS servers:

- the new api
- the open files tracker
- websocket api (temporary/legacy shim)
*/

import { getLogger } from "@cocalc/project/logger";
import { init as initAPI } from "./api";
import { init as initOpenFiles } from "./open-files";
// TODO: initWebsocketApi is temporary
import { init as initWebsocketApi } from "./browser-websocket-api";
import { init as initListings } from "./listings";
import { init as initRead } from "./files/read";
import { init as initWrite } from "./files/write";

const logger = getLogger("project:conat:index");

export default async function init() {
  logger.debug("starting NATS project services");
  await initAPI();
  await initOpenFiles();
  initWebsocketApi();
  await initListings();
  await initRead();
  await initWrite();
}
