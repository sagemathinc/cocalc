import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initDatabase } from "@cocalc/database/nats/changefeeds";
import { init as initLLM } from "./llm";
import { init as initAuth } from "./auth";
import { init as initTieredStorage } from "./tiered-storage/api";
import { loadNatsConfiguration } from "./configuration";

export { loadNatsConfiguration };

const logger = getLogger("server:nats");

export async function initNatsDatabaseServer() {
  await loadNatsConfiguration();
  // do NOT await initDatabase
  initDatabase();
}

export async function initNatsTieredStorage() {
  await loadNatsConfiguration();
  initTieredStorage();
}

export async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  await loadNatsConfiguration();
  initAPI();
  await initAuth();
  await initLLM();
}
