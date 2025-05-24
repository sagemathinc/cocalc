import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
import { initServer as initPersistServer } from "@cocalc/backend/conat/persist";

export { loadConatConfiguration };

const logger = getLogger("server:nats");

export async function initConatChangefeedServer() {
  await loadConatConfiguration();
  // do NOT await initDatabase
  initChangefeedServer();
}

export async function initConatMicroservices() {
  logger.debug("initializing nats cocalc hub server");
  await loadConatConfiguration();
  
  // do not block on any of these!
  initAPI();
  initLLM();
  initPersistServer();
  createTimeService();
}
