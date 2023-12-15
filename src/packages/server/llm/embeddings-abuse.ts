/*
Rate limitations to prevent blatant or accidental (e.g., a bug by me) abuse of
the openai embeddings api endpoint.

- First note that openai has api rate limits posted here:
   https://platform.openai.com/account/rate-limits
For the embedding model, the limits are:
3,000 requests per minute
250,000 tokens per minute

The cost for embeddings is $0.0004 / 1K tokens (see https://openai.com/pricing).
So 250,000 tokens is $0.10, so it seems like the max spend per hour is $6...
which is nearly $5K/month.

We want to cap the max spend per *free user* at something like $1/month, which is
2.5 million tokens.  So if you use 3500 tokens per hour, that would exceed $1/month,
so we can't just cap per hour for this embeddings stuff, since it is very bursty.
We could do 100K/day, since hitting that every day for a month is about $1.50, which
is probably fine... though we do have over 30K active users, and $45K is a lot of money!

So let's just think about a max across all users first.  If want to spend at most $1K/month
on indexing, that's about 1/5 of the above limit, i.e., 50K/minute, or 3 million/hour.

We'll cap for now at an average cap of about 5 million tokens per hour; this would
keep cost below $2K/month.

And we will definitely have a "pay for what you use" option to index and search
any amount of content!

*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getPool from "@cocalc/database/pool";

const QUOTA = [
  //{ upTo: 100000, perUser: 1000 }, // FOR TESTING ONLY!
  { upTo: 1000000, perUser: 250000 },
  { upTo: 2000000, perUser: 100000 },
  { upTo: 3000000, perUser: 20000 },
  { upTo: 4000000, perUser: 10000 },
  { upTo: 5000000, perUser: 5000 },
];

function perUserQuotaPerHour(global: number): number {
  for (const { upTo, perUser } of QUOTA) {
    if (global <= upTo) {
      return perUser;
    }
  }
  return 0;
}

export default async function checkForAbuse(account_id: string): Promise<void> {
  const { neural_search_enabled } = await getServerSettings();
  if (!neural_search_enabled) {
    // ensure that if you explicitly switch off neural search, then all api requests fail quickly,
    // even if some frontend browsers haven't got the message (or don't care).
    throw Error("Neural search is currently disabled.");
  }
  const global = await recentUsage({
    cache: "medium",
    period: "1 hour",
  });
  const user = await recentUsage({
    cache: "short",
    period: "1 hour",
    account_id,
  });
  if (user > perUserQuotaPerHour(global)) {
    throw Error(
      "There are too many requests to the embeddings API right now.  Please try again in a few minutes."
    );
  }
}

async function recentUsage({
  period,
  account_id,
  cache,
}: {
  period: string;
  account_id?: string;
  cache?: "short" | "medium" | "long";
}): Promise<number> {
  const pool = getPool(cache);
  let query, args;
  if (account_id) {
    query = `SELECT SUM(tokens) AS usage FROM openai_embedding_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else {
    query = `SELECT SUM(tokens) AS usage FROM openai_embedding_log WHERE time >= NOW() - INTERVAL '${period}'`;
    args = [];
  }
  const { rows } = await pool.query(query, args);
  // console.log("rows = ", rows);
  return parseInt(rows[0]?.["usage"] ?? 0); // undefined = no results in above select,
}
