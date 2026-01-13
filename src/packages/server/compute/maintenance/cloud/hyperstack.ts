/*
Responsibilities here:

  - checking if the balance is low and sending an email if so
  - making sure every VM and disk (with the right named prefix) is
    accounted for in our database, and if not delete it, to make sure we
    do not waste money due to a weird bug or node restart issue.

TODO: The frequency of email alerts and this check is done in code here,
but would be better configured via admin settings...
*/

import { getCredit } from "@cocalc/server/compute/cloud/hyperstack/client";
import { globalResourceSync } from "@cocalc/server/compute/cloud/hyperstack/sync";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { moneyToCurrency } from "@cocalc/util/money";
import { createTTLCache } from "@cocalc/server/compute/database-cache";
import getLogger from "@cocalc/backend/logger";
import adminAlert from "@cocalc/server/messages/admin-alert";

const logger = getLogger("server:compute:maintenance:cloud:hyperstack");

let running = false;
export async function hyperstackMaintenance() {
  if (running) {
    logger.debug(
      "doMaintenance -- skipping a round due to it running too slowly",
    );
    // overwhelmed -- skip this one
    return;
  }
  try {
    running = true;
    try {
      logger.debug("hyperstackMaintenance: balanceCheck");
      await balanceCheck();
    } catch (err) {
      logger.debug("hyperstackMaintenance: balanceCheck ERROR -- ", err);
    }
    try {
      logger.debug("hyperstackMaintenance: globalResourceSync");
      await globalResourceSync();
    } catch (err) {
      logger.debug("hyperstackMaintenance: globalResourceSync ERROR -- ", err);
    }
  } catch (err) {
    // can't happen
    logger.debug("hyperstackMaintenance: ERROR -- ", err);
  } finally {
    running = false;
  }
}

// send a panic'd email at most once ever 90 minutes.
const EMAIL_PERIOD_THRESH_MS = 1000 * 60 * 90;

// we use a database-backed cache as well, in case the hub-maintenance
// nodejs process is restarted.
const balanceCache = createTTLCache({
  ttl: EMAIL_PERIOD_THRESH_MS,
  cloud: "hyperstack",
  prefix: "maintenance",
});
let lastEmailed = 0;

async function balanceCheck() {
  if (Date.now() - lastEmailed <= EMAIL_PERIOD_THRESH_MS) {
    logger.debug(
      "balanceCheck: skipping since an email was already sent recently",
    );
    return;
  }

  const { email_enabled, hyperstack_api_key, hyperstack_balance_alert_thresh } =
    await getServerSettings();
  if (
    !hyperstack_api_key ||
    !email_enabled ||
    !hyperstack_balance_alert_thresh
  ) {
    // can't possibly due anything useful.
    return;
  }

  if (await balanceCache.has("lastEmailed")) {
    return;
  }

  const { credit } = await getCredit();
  if (credit <= hyperstack_balance_alert_thresh) {
    logger.debug("balanceCheck: RED ALERT ", {
      credit,
      hyperstack_balance_alert_thresh,
    });
    const { site_name: siteName } = await getServerSettings();
    const subject = `${siteName} HYPERSTACK BALANCE ALERT`;
    const body = `Dear ${siteName} Admin,

The balance on the Hyperstack account is ${moneyToCurrency(credit)}, which is below the
threshold of ${moneyToCurrency(hyperstack_balance_alert_thresh)}.

-- ${siteName}
`;
    await adminAlert({ subject, body });
    lastEmailed = Date.now();
    await balanceCache.set("lastEmailed", lastEmailed);
  }
}
