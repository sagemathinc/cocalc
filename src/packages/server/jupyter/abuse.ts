/*
We initially just implement some very simple rate limitations to prevent very
blatant abuse.  Everything is hardcoded and nothing is configurable via the
admin settings panel yet.
*/

import { isValidUUID, isValidAnonymousID } from "@cocalc/util/misc";
import recentUsage from "./recent-usage";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("jupyter-api:abuse");

const PERIOD = "1 hour";

// This is the max amount of time in seconds user can use during the given PERIDO
// cached output doesn't count.  This is ONLY usage in the public pool of servers,
// and computation in a user's own project doesn't count.
const QUOTAS = {
  noAccount: 60 * 3, // 3 minutes per hour of total time for a non-signed in user.
  account: 60 * 15, // 15 minutes per hour for a signed in user
  global: 3600 * 5, // gobal: up to about 5 things running at once all the time
};

// for testing
// const QUOTAS = {
//   noAccount: 10,
//   account: 20,
//   global: 30,
// };

// Throws an exception if the request should not be allowed.
export default async function checkForAbuse({
  account_id,
  anonymous_id,
}: {
  account_id?: string;
  anonymous_id?: string;
}): Promise<void> {
  if (!isValidUUID(account_id) && !isValidAnonymousID(anonymous_id)) {
    // at least some amount of tracking.
    throw Error("at least one of account_id or anonymous_id must be set");
  }
  const usage = await recentUsage({
    cache: "short",
    period: PERIOD,
    account_id,
    anonymous_id,
  });
  log.debug("recent usage by this user", {
    account_id,
    anonymous_id,
    usage,
  });
  if (account_id) {
    if (usage > QUOTAS.account) {
      throw Error(
        `You may use at most ${QUOTAS.account} seconds of compute time per ${PERIOD}. Please try again later or do this computation in a project.`,
      );
    }
  } else if (usage > QUOTAS.noAccount) {
    throw Error(
      `You may use at most ${QUOTAS.noAccount} seconds of compute time per ${PERIOD}. Sign in to increase your quota.`,
    );
  }

  // Prevent more sophisticated abuse, e.g., changing analytics_cookie or account frequently,
  // or just a general huge surge in usage.
  const overallUsage = await recentUsage({ cache: "medium", period: PERIOD });
  log.debug("overallUsage = ", usage);
  if (overallUsage > QUOTAS.global) {
    throw Error(
      `There is too much overall usage of code evaluation right now.  Please try again later or do this computation in a project.`,
    );
  }
}
