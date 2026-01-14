import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";
import { init as initChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { init as initLLM } from "./llm";
import { loadConatConfiguration } from "./configuration";
import { createTimeService } from "@cocalc/conat/service/time";
import { listenForUpdates as listenForProjectHostUpdates } from "./route-project";
export { initConatPersist } from "./persist";
import {
  conatApiCount,
  projectRunnerCount,
  conatChangefeedServerCount,
} from "@cocalc/backend/data";
import * as Module from "module";
import { conat } from "@cocalc/backend/conat";
import { initHostRegistryService } from "./host-registry";
import { initHostStatusService } from "./host-status";
import { startCopyLroWorker } from "@cocalc/server/projects/copy-worker";

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
  logger.debug("initConatApi: the central api services", {
    conatApiCount,
    projectRunnerCount,
  });
  await loadConatConfiguration();

  // do not block on any of these!
  for (let i = 0; i < conatApiCount; i++) {
    initAPI();
  }
  startCopyLroWorker();
  initLLM();
  if (process.env.COCALC_MODE !== "launchpad") {
    const { init: initProjectRunner } = lazyRequire(
      "./project/run",
    ) as {
      init: () => Promise<void>;
    };
    for (let i = 0; i < projectRunnerCount; i++) {
      initProjectRunner();
    }
    const { init: initProjectRunnerLoadBalancer } = lazyRequire(
      "./project/load-balancer",
    ) as {
      init: () => Promise<void>;
    };
    initProjectRunnerLoadBalancer();
  } else {
    logger.info("launchpad mode: skipping project runner services");
  }
  createTimeService();
}

export async function initConatHostRegistry() {
  logger.debug("initHostRegistryService");
  await loadConatConfiguration();
  await initHostRegistryService();
  await initHostStatusService();
  listenForProjectHostUpdates();
}

const moduleRequire: NodeRequire | undefined =
  typeof require === "function"
    ? require
    : typeof (Module as { createRequire?: (path: string) => NodeRequire })
          .createRequire === "function"
      ? (Module as { createRequire: (path: string) => NodeRequire }).createRequire(
          __filename,
        )
      : undefined;

function lazyRequire<T = any>(moduleName: string): T {
  if (!moduleRequire) {
    throw new Error("require is not available in this runtime");
  }
  return moduleRequire(moduleName) as T;
}
