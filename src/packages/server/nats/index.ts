import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeeds } from "@cocalc/database/nats/changefeeds";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  // do NOT await this!
  initAPI();
  initChangefeeds();
}
