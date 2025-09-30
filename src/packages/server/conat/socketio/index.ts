export { init as initConatServer } from "./server";

import { loadConatConfiguration } from "../configuration";
import { conat } from "@cocalc/backend/conat";
import { createStickyRouter } from "@cocalc/conat/core/sticky";
import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("server:conat:socketio");

export async function initStickyRouterService() {
  logger.debug("initStickyRouterService");
  await loadConatConfiguration();
  const client = conat();
  createStickyRouter({ client });
}
