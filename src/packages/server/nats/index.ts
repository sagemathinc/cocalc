import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initDatabase } from "@cocalc/database/nats/changefeeds";
import { init as initLLM } from "./llm";
import { init as initAuth } from "./auth";
import { loadNatsPassword } from "./password";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  await loadNatsPassword();
  initAPI(); // do NOT await initAPI
  initDatabase();
  await initAuth();
  await initLLM();
}
