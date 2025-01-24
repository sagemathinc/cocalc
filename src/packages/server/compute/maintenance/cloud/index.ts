/*
Each of the functions listed here will get automatically called every couple
of minutes as part of the general purchases maintenance functionality.  Use
this to periodically update aspects of the compute servers.

*/

import stateSync from "./state-sync";
import getLogger from "@cocalc/backend/logger";
import { hyperstackMaintenance } from "./hyperstack";

import healthCheck from "./health-check";
import idleTimeout from "./idle-timeout";
import spendLimit from "./spend-limit";
import shutdownTime from "./shutdown-time";

const logger = getLogger("server:compute:maintenance:cloud");

const MANAGE_CLOUD_SYNC_INTERVAL_MS = 30 * 1000; // every 30 seconds

// every 15 minutes do hyperstack maintenance, depending on what is configured
const HYPERSTACK_SYNC_INTERVAL_MS = 60 * 1000 * 15;

let initialized = false;
async function startMaintenance() {
  if (initialized) {
    // we just use first call to setup loop below, then ignore future calls.
    return;
  }
  initialized = true;
  // DO NOT AWAIT THIS!!!
  setInterval(stateSyncMaintenance, MANAGE_CLOUD_SYNC_INTERVAL_MS);

  setInterval(hyperstackMaintenance, HYPERSTACK_SYNC_INTERVAL_MS);

  // must be **at least** once per minute
  setInterval(healthCheck, 45 * 1000);

  // once per minute makes sense
  setInterval(idleTimeout, 60 * 1000);

  setTimeout(spendLimit, 30 * 1000); // also 30s after startup
  setInterval(spendLimit, 60 * 1000);

  setTimeout(shutdownTime, 30 * 1000);
  setInterval(shutdownTime, 60 * 1000);
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
