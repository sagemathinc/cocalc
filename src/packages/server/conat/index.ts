import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
export { initConatPersist } from "./persist";
import { conatApiCount, projects } from "@cocalc/backend/data";
import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { init as initProjectRun } from "./project/run";

export { loadConatConfiguration };

const logger = getLogger("server:conat");

export async function initConatChangefeedServer() {
  logger.debug(
    "initConatChangefeedServer: postgresql database query changefeeds",
  );
  await loadConatConfiguration();
  initChangefeedServer();
}

export async function initConatApi() {
  logger.debug("initConatApi: the central api services", { conatApiCount });
  await loadConatConfiguration();

  // do not block on any of these!
  for (let i = 0; i < conatApiCount; i++) {
    initAPI();
  }
  initLLM();
  initProjectRun();
  createTimeService();
}

export async function initConatFileserver() {
  await loadConatConfiguration();
  const i = projects.indexOf("/[project_id]");
  if (i == -1) {
    throw Error(
      `projects must be a template containing /[project_id] -- ${projects}`,
    );
  }
  const path = projects.slice(0, i);
  logger.debug("initFileserver", { path });
  localPathFileserver({ path });
}
