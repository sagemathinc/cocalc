import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
import { server as initPersistServer } from "@cocalc/backend/conat/persist";


export { loadConatConfiguration };

const logger = getLogger("server:conat");

export async function initConatChangefeedServer() {
  logger.debug("initConatChangefeedServer");
  await loadConatConfiguration();
  initChangefeedServer();
}

export async function initConatMicroservices() {
  logger.debug("initializing conat cocalc hub server");
  await loadConatConfiguration();

  // do not block on any of these!
  initAPI();
  initLLM();
  initPersistServer();
  createTimeService();
}
