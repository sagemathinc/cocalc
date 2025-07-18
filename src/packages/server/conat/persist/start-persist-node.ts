import { loadConatConfiguration } from "../configuration";
import { initPersistServer } from "@cocalc/backend/conat/persist";
import { getLogger } from "@cocalc/backend/logger";
import { addErrorListeners } from "@cocalc/server/metrics/error-listener";

const logger = getLogger("server:conat:persist:start-persist-node");

async function main() {
  logger.debug("starting forked persist node in process", process.pid);
  console.log("starting forked persist node in process", process.pid);
  addErrorListeners();
  await loadConatConfiguration();
  await initPersistServer();
}

main();
