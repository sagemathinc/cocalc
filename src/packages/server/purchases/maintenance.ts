import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { maintainActivePurchases as maintainProjectUpgrades } from "./project-quotas";
import maintainSubscriptions from "./maintain-subscriptions";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:maintenance");

// For now -- once every 5 minutes
const LOOP_INTERVAL_MS = 1000 * 60 * 5;

const FUNCTIONS = [
  { f: maintainProjectUpgrades, desc: "maintain project upgrade quotas" },
  { f: maintainSubscriptions, desc: "maintain subscriptions" },
];

export default async function init() {
  async function f() {
    try {
      const { commercial } = await getServerSettings();
      if (!commercial) return;
      await doMaintenance();
    } catch (err) {
      logger.error("doMaintenance error", err);
    }
  }
  setInterval(f, LOOP_INTERVAL_MS);
}

async function doMaintenance() {
  logger.debug("doing purchase maintenance");
  for (const { f, desc } of FUNCTIONS) {
    try {
      logger.debug("maintenance ", desc);
      await f();
    } catch (err) {
      logger.error("error running maintenance ", desc, err);
    }
  }
}
