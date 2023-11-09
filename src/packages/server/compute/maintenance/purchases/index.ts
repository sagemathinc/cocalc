/*
Each of the functions listed here will get automatically called every couple
of minutes as part of the general purchases maintenance functionality.  Use
this to periodically update aspects of the compute servers.

*/

import ongoingPurchases from "./ongoing-purchases";
import managePurchases from "./manage-purchases";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";

const logger = getLogger("server:compute:maintenance:purchases");

const MANAGE_PURCHASES_DELAY_MS = 15 * 1000; // every 15 seconds
const MANAGE_ACTIVE_PURCHASES_DELAY_MS = 120 * 1000; // every 2 minutes

let initialized = false;
async function startMaintenance() {
  if (initialized) {
    // we just use first call to setup loop below, then ignore future calls.
    return;
  }
  initialized = true;
  let lastManageActive = 0;
  while (true) {
    try {
      await managePurchases();
    } catch (err) {
      logger.debug(
        `WARNING -- issue managing purchases due to state changes -- ${err}`,
      );
    }
    await delay(MANAGE_PURCHASES_DELAY_MS);

    // Periodically, we also manage the active purchases
    const now = Date.now();
    if (now - lastManageActive >= MANAGE_ACTIVE_PURCHASES_DELAY_MS) {
      lastManageActive = now;
      try {
        await ongoingPurchases();
      } catch (err) {
        logger.debug(
          `WARNING -- issue managing ongoing active purchases -- ${err}`,
        );
      }
    }
  }
}

export const task = {
  f: startMaintenance,
  desc: "maintain ongoing active compute server purchases",
} as const;
