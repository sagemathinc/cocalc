import { connect } from "nats";
import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  const nc = await connect();
  logger.debug(`connected to ${nc.getServer()}`);
  initAPI(nc);;
}
