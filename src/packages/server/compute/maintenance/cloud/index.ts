/*
Each of the functions listed here will get automatically called every couple
of minutes as part of the general purchases maintenance functionality.  Use
this to periodically update aspects of the compute servers.

*/

import stateSync from "./state-sync";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:maintenance:cloud");

const MANAGE_CLOUD_SYNC_INTERVAL_MS = 30 * 1000; // every 30 seconds

let initialized = false;
async function startMaintenance() {
  if (initialized) {
    // we just use first call to setup loop below, then ignore future calls.
    return;
  }
  initialized = true;
  setInterval(stateSyncMaintenance, MANAGE_CLOUD_SYNC_INTERVAL_MS);
}

let running = false;
async function stateSyncMaintenance() {
  if (running) {
    logger.debug(
      "doMaintenance -- skipping a round due to it running too slowly",
    );
    // overwhelmed -- skip this one
    return;
  }
  try {
    running = true;
    logger.debug("stateSyncMaintenance");
    await stateSync();
    logger.debug("stateSyncMaintenance: success");
  } catch (err) {
    logger.debug("stateSyncMaintenance: error -- ", err);
  } finally {
    running = false;
  }
}

export const task = {
  f: startMaintenance,
  desc: "maintain state sync between cloud and our database",
} as const;
