/*
Initialize a loop that continually adds or updates or syncs data with salesloft.

For now it just periodically adds users who made a new account during the last day,
if salesloft is configured, and does nothing otherwise.

We will add additional sync mechanisms later.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import { addNewUsers } from "./sync";
import { updateMoney } from "./money";

const log = getLogger("salesloft:init");
const UPDATE_INTERVAL_MS = 1000 * 60 * 60 * 6; // once every 6 hours.

export default async function init() {
  let running = false;
  const f = async () => {
    if (running) {
      log.debug("skipping run since previous still running");
      return;
    }
    try {
      running = true;
      log.debug("Doing a salesloft MONEY update...");
      try {
        await updateMoney("1 day");
      } catch (err) {
        log.debug("WARNING -- issue doing updateMoney", err);
      }
      log.debug("Doing a salesloft sync update...");
      try {
        await update();
      } catch (err) {
        log.debug("WARNING -- issue doing update", err);
      }
    } catch (err) {
      log.debug("WARNING: Error doing salesloft update", err);
    } finally {
      running = false;
    }
  };
  setInterval(f, UPDATE_INTERVAL_MS);
  log.debug("Waiting a minute before doing first salesloft sync...");
  setTimeout(f, 1000 * 60); // first update after a minute delay
}

async function update() {
  const { salesloft_api_key: apiKey } = await getServerSettings();
  if (!apiKey) {
    log.debug("Salesloft not configured.");
    return;
  }
  log.debug(
    "Salesloft periodic sync -- adding new users who made an account during the last day",
  );
  await addNewUsers("1 day");
}
