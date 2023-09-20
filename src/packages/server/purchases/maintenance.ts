import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { maintainActivePurchases as maintainProjectUpgrades } from "./project-quotas";
import maintainSubscriptions from "./maintain-subscriptions";
import maintainStatements from "./statements/maintenance";
import getLogger from "@cocalc/backend/logger";
import maintainAutomaticPayments from "./maintain-automatic-payments";
import maintainLegacyUpgrades from "./legacy/maintain-legacy-upgrades";

const logger = getLogger("purchases:maintenance");

// For now -- once every 5 minutes -- though NO GUARANTEES, since if it takes longer
// than 5 minutes to run a round of maintenance then the next one would be skipped.
const LOOP_INTERVAL_MS = 1000 * 60 * 5;

const FUNCTIONS = [
  { f: maintainProjectUpgrades, desc: "maintain project upgrade quotas" },
  { f: maintainSubscriptions, desc: "maintain subscriptions" },
  { f: maintainStatements, desc: "maintain statements" },
  { f: maintainAutomaticPayments, desc: "maintain automatic payments" },
  {
    f: maintainLegacyUpgrades,
    desc: "maintain legacy upgrade packages from long long ago",
  },
];

export default async function init() {
  let running: boolean = false;
  async function f() {
    if (running) {
      logger.debug(
        "Skipping round of maintenance since previous one already running"
      );
      return;
    }
    try {
      running = true;
      const { commercial } = await getServerSettings();
      if (!commercial) return;
      await doMaintenance();
    } catch (err) {
      logger.error("doMaintenance error", err);
    } finally {
      running = false;
    }
  }
  // Do a first round in a couple of seconds:
  setTimeout(f, 10000);
  // And every few minutes afterwards.
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
