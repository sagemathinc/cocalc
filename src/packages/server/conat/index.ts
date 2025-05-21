import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initDatabase } from "@cocalc/database/conat/changefeeds";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { init as initTieredStorage } from "./tiered-storage/api";
import { loadNatsConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
import { initServer as initPersistServer } from "@cocalc/backend/conat/persist";

export { loadNatsConfiguration };

const logger = getLogger("server:nats");

export async function initNatsDatabaseServer() {
  await loadNatsConfiguration();
  // do NOT await initDatabase
  initDatabase();
}

export async function initNatsChangefeedServer() {
  await loadNatsConfiguration();
  // do NOT await initDatabase
  initChangefeedServer();
}

export async function initNatsTieredStorage() {
  await loadNatsConfiguration();
  initTieredStorage();
}

export async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  
  await loadNatsConfiguration();
  initAPI();

  // do not block on initLLM because...
  initLLM();
  
  initPersistServer();

  createTimeService();
}
