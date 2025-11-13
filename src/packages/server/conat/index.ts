import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
export { initConatPersist } from "./persist";
import {
  conatApiCount,
  conatChangefeedServerCount,
} from "@cocalc/backend/data";
import { conat } from "@cocalc/backend/conat";

export { loadConatConfiguration };

const logger = getLogger("server:conat");

export async function initConatChangefeedServer() {
  logger.debug(
    "initConatChangefeedServer: postgresql database changefeed server",
    { conatChangefeedServerCount },
  );
  await loadConatConfiguration();
  for (let i = 0; i < conatChangefeedServerCount; i++) {
    initChangefeedServer({ client: conat({ noCache: true }) });
  }
}

export async function initConatApi() {
  logger.debug("initConatApi: the central api services", { conatApiCount });
  await loadConatConfiguration();

  // do not block on any of these!
  for (let i = 0; i < conatApiCount; i++) {
    initAPI();
  }
  initLLM();
  createTimeService();
}
