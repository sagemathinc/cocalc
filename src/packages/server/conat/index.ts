import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
import { initPersistServer } from "@cocalc/backend/conat/persist";

export { loadConatConfiguration };

const logger = getLogger("server:conat");

export async function initConatChangefeedServer() {
  logger.debug(
    "initConatChangefeedServer: postgresql database query changefeeds",
  );
  await loadConatConfiguration();
  initChangefeedServer();
}

export async function initConatPersist() {
  logger.debug("initPersistServer: sqlite3 stream persistence");
  await loadConatConfiguration();
  initPersistServer();
}

export async function initConatApi() {
  logger.debug("initConatApi: the central api services");
  await loadConatConfiguration();

  // do not block on any of these!
  initAPI();
  initLLM();
  createTimeService();
}

export async function initConatCore() {
  logger.debug("initConatApi: socketio websocsocket server on a port");
  await loadConatConfiguration();
}
