import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

/*
We initially just implement some very simple rate limitations to prevent very
blatant abuse.

- at most $10^4$ tokens per non-signed in user per hour \(that's \$0.02\); that's still a lot.
- at most $10^5$ tokens per signed in user per hour \(that's \$0.20\); that allows for major usage...
  but if somebody tried to do something really abusive, it would stop it.  Nobody
  would hit this in practice unless they are really trying to abuse cocalc.
- at most $10^6$ tokens per hour across all users \-\- that's \$2/hour. That would
  come out to a bit more if sustained than my budget, but allows for bursts.

See https://help.openai.com/en/articles/7039783-chatgpt-api-faq for the upstream rate limits,
where they limit per minute, not per hour (like below):

    What's the rate limits for the ChatGPT API?

    Free trial users: 20 RPM 40000 TPM
    Pay-as-you-go users (first 48 hours): 60 RPM 60000 TPM
    Pay-as-you-go users (after 48 hours): 3500 RPM 90000 TPM

    RPM = requests per minute
    TPM = tokens per minute
*/

const QUOTAS = {
  noAccount: 10 ** 4,
  account: 10 ** 5,
  global: 10 ** 6,
};

/* for testing
const QUOTAS = {
  noAccount: 300,
  account: 1000,
  global: 3000,
};
*/

// Throws an exception if the request should not be allowed.
export async function checkForAbuse({
  account_id,
  analytics_cookie,
}: {
  account_id?: string;
  analytics_cookie?: string;
}): Promise<void> {
  if (!isValidUUID(account_id) && !isValidUUID(analytics_cookie)) {
    // at least some amount of tracking.
    throw Error("at least one of account_id or analytics_cookie must be set");
  }

  const usage = await recentUsage({
    cache: "short",
    period: "1 hour",
    account_id,
    analytics_cookie,
  });
  // console.log("usage = ", usage);
  if (account_id) {
    if (usage > QUOTAS.account) {
      throw Error(
        `You may use at most ${QUOTAS.account} tokens per hour. Please try again later.`
      );
    }
  } else if (usage > QUOTAS.noAccount) {
    throw Error(
      `You may use at most ${QUOTAS.noAccount} tokens per hour. Sign in to increase your quota.`
    );
  }

  // Prevent more sophisticated abuse, e.g., changing analytics_cookie or account frequently,
  // or just a general huge surge in usage.
  const overallUsage = await recentUsage({ cache: "long", period: "1 hour" });
  // console.log("overallUsage = ", usage);
  if (overallUsage > QUOTAS.global) {
    throw Error(
      `There is too much usage of ChatGPT right now.  Please try again later.`
    );
  }
}

async function recentUsage({
  period,
  account_id,
  analytics_cookie,
  cache,
}: {
  period: string;
  account_id?: string;
  analytics_cookie?: string;
  // some caching so if user is hitting us a lot, we don't hit the database to
  // decide they are abusive -- at the same time, short enough that we notice.
  // Recommendation: "short"
  cache?: "short" | "medium" | "long";
}): Promise<number> {
  let query, args;
  if (account_id) {
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else if (analytics_cookie) {
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [analytics_cookie];
  } else {
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE time >= NOW() - INTERVAL '${period}'`;
    args = [];
  }
  const pool = getPool(cache);
  const { rows } = await pool.query(query, args);
  // console.log("rows = ", rows);
  return parseInt(rows[0]?.["usage"] ?? 0); // undefined = no results in above select,
}
