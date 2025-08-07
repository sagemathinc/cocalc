/*
Project run server load balancer
*/

import { conat } from "@cocalc/backend/conat";
import { server as loadBalancer } from "@cocalc/conat/project/runner/load-balancer";
import { loadConatConfiguration } from "../configuration";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:project:load-balancer");

let server;
export async function init() {
  logger.debug("init");
  await loadConatConfiguration();
  server = await loadBalancer({ client: conat() });
  logger.debug("running");
}

export function close() {
  logger.debug("close");
  server?.close();
}
