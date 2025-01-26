import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { getConnection } from "@cocalc/backend/nats";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  const nc = await getConnection();
  logger.debug(`connected to ${nc.getServer()}`);
  initAPI(nc);
}
