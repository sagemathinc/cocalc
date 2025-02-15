import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initDatabase } from "@cocalc/database/nats/changefeeds";
f
const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  // do NOT await this!
  initAPI();
  initDatabase();
}
