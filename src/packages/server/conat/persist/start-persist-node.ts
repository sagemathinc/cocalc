import { loadConatConfiguration } from "../configuration";
import { initPersistServer } from "@cocalc/backend/conat/persist";
import { getLogger } from "@cocalc/backend/logger";
import { addErrorListeners } from "@cocalc/server/metrics/error-listener";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";

const logger = getLogger("server:conat:persist:start-persist-node");

async function main() {
  const id = process.env.PERSIST_SERVER_ID;
  logger.debug("starting forked persist node in process", process.pid, { id });
  console.log("starting forked persist node in process", process.pid, { id });
  addErrorListeners();
  await loadConatConfiguration();
  await initPersistServer({
    id,
    clusterMode: true,
    service: PERSIST_SERVICE,
  });
}

main();
