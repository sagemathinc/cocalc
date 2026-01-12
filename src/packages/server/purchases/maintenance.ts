import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { TASKS as computeServerTasks } from "@cocalc/server/compute/maintenance";
import maintainSubscriptions from "./maintain-subscriptions";
import maintainStatements from "./statements/maintenance";
import getLogger from "@cocalc/backend/logger";
import maintainAutomaticPayments from "./maintain-automatic-payments";
import maintainAutoBalance from "./maintain-auto-balance";
import maintainLegacyUpgrades from "./legacy/maintain-legacy-upgrades";
import { maintainPaymentIntents } from "./stripe/process-payment-intents";

const logger = getLogger("purchases:maintenance");

// By default wait this long after running maintenance task.
const DEFAULT_DELAY_MS = 1000 * 60 * 5;

interface MaintenanceDescription {
  // The async function to run
  f: () => Promise<void>;
  // A description of what it does (for logging)
  desc: string;
}

const FUNCTIONS: MaintenanceDescription[] = [
  { f: maintainSubscriptions, desc: "maintain subscriptions" },
  { f: maintainStatements, desc: "maintain statements" },
  {
    f: maintainPaymentIntents,
    desc: "processing any outstanding payment intents",
  },
  { f: maintainAutomaticPayments, desc: "maintain automatic payments" },
  { f: maintainAutoBalance, desc: "maintain auto balance" },
  {
    f: maintainLegacyUpgrades,
    desc: "maintain legacy upgrade packages from long long ago",
  },
];

for (const x of computeServerTasks) {
  FUNCTIONS.push(x);
}

export default async function init() {
  let running: boolean = false;
  async function f() {
    if (running) {
      logger.debug(
        "Skipping round of maintenance since previous one already running",
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
  setInterval(f, DEFAULT_DELAY_MS);
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
