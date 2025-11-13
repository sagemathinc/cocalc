/*
Given an array of any size of cocalc account_id's, create or update corresponding
salesloft people.

Salesloft has a hard requirement that a person has an email address or phone
number. We don't have phone numbers in cocalc, so if a cocalc account has no email
address, then we just skip it.

We include or update the following information about each person:

- email_address
- first_name
- last_name

THESE ARE NOT used at all yet, since they must be configured from the web interface as explained here:
https://help.salesloft.com/s/article/Person-Field-Configuration#Add_Custom_Person_Field

The following are the custom_fields that we actually use:
  - cocalc_account_id: the cocalc account_id
  - cocalc_created: date when cocalc account was created (UTC timestamp)
  - cocalc_last_active: date when cocalc account was last active (UTC timestamp)
  - stripe_customer_id: if they interacted with our payment system, they will have a stripe id
  - cocalc_notes: if we typed in notes about them via our CRM
  - cocalc_purchase_timestamp: the most recent timestamp where we updated information about their spend, based on daily statements
  - cocalc_balance: their balance at cocalc_purchase_timestamp, from the most recent daily statement
  - cocalc_last_month_spend: amount they spent during the last 30 days, according to daily statements only
  - cocalc_last_year_spend: the total amount they have spent during the last year, according to monthly statements
  - cocalc_tags: zero or more of 'personal' or 'student' or 'instructor' or 'professional', separated by comma (no space, in alphabetical order)
    these can be easily customized in the CRM.

RATE LIMITS:

- Documented here: https://developers.salesloft.com/docs/platform/api-basics/rate-limits/

- The rate limit is "600 costs per minute" where a cost is some weird unit that
depends on the api endpoint, and can by 1 or 30 or any arbitrarily large number
below 600! And they have this distopian statement: "Salesloft is able to change
the cost for an existing endpoint at any time, as the functionality doesn't
become deprecated from a cost change."  There is no possible way to
know ahead of time if calls are going to the rate limit or not.  So in
our code below, we basically space out handling each person by 1s. That
keeps the number of people per minute to at most 60, which should keep us
well below the 600 costs per minute limit.  And spending a few hours to update
10K records is fine for now.

Spacing out by a minute doesn't work.  It's all very weird.  I'll try
exponential backoff with up to 10 minutes between attempts.
*/

import getPool from "@cocalc/database/pool";
import { create, list, update } from "./people";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";

const logger = getLogger("salesloft:sync");
const log = logger.debug.bind(logger);

export async function sync(
  account_ids: string[],
  delayMs: number = 250, // wait this long after handling each account_id
  maxDelayMs: number = 1000 * 60 * 15, // exponential backoff up to this long.
): Promise<{
  update: number;
  create: number;
  salesloft_ids: { [account_id: string]: number };
}> {
  const cocalc = getPool("long");
  const salesloft_ids: { [account_id: string]: number } = {};

  log(
    "get all data we will need from cocalc's database about ",
    account_ids.length,
    "accounts",
  );
  const { rows } = await cocalc.query(
    "SELECT account_id AS cocalc_account_id, salesloft_id, created AS cocalc_created, last_active AS cocalc_last_active, stripe_customer_id, tags AS cocalc_tags, notes AS cocalc_notes, email_address, first_name, last_name, sign_up_usage_intent FROM accounts WHERE account_id=ANY($1) AND email_address IS NOT NULL",
    [account_ids],
  );
  log("got ", rows.length, " records with an email address");

  const stats = { update: 0, create: 0, salesloft_ids };
  let currentDelayMs = 2 * delayMs;
  for (const row of rows) {
    log("considering ", row.email_address);
    try {
      const id = await syncOne({ row, stats, cocalc });
      salesloft_ids[row.cocalc_account_id] = id;
      currentDelayMs = 2 * delayMs; // success - reset this
    } catch (err) {
      log(`Failed to sync ${row.email_address}`, err);
      log(
        "We do not retry since, e.g., some errors are fatal, e.g., invalid email addresses.",
      );
      log(
        `We do wait ${currentDelayMs}ms in case this is due to rate limits or other issues...`,
      );
      await delay(currentDelayMs);
      // exponential delay
      currentDelayMs = Math.min(currentDelayMs * 1.3, maxDelayMs);
    }
    log(`Waiting ${delayMs}ms due to potential rate limits...`);
    await delay(delayMs);
  }
  return stats;
}

async function syncOne({ row, stats, cocalc }): Promise<number> {
  const data = toSalesloft(row);
  if (row.salesloft_id) {
    log(
      "already exists in salesloft with salesloft_id = ",
      row.salesloft_id,
      "so updating...",
    );
    // person already exists in salesloft, so update it
    await update(row.salesloft_id, data);
    stats.update += 1;
    return row.salesloft_id;
  } else {
    log("does not exists in salesloft yet...");
    // They *might* exist for some reason, even though we haven't explicitly linked them.
    log("Do email search...");
    const matches = await list({ email_addresses: [row.email_address] });
    let salesloft_id;
    if (matches.data.length > 0) {
      log("They exist, so update them");
      salesloft_id = matches.data[0].id;
      await update(salesloft_id, data);
      stats.update += 1;
    } else {
      log("Do not exist, so create them");
      const result = await create(data);
      salesloft_id = result.data.id;
      stats.create += 1;
    }
    log(
      "Link this cocalc account ",
      row.cocalc_account_id,
      "to this salesloft account",
      salesloft_id,
    );
    await cocalc.query(
      "UPDATE accounts SET salesloft_id=$1 WHERE account_id=$2",
      [salesloft_id, row.cocalc_account_id],
    );
    return salesloft_id;
  }
}

function toSalesloft({
  first_name,
  last_name,
  email_address,
  cocalc_account_id,
  cocalc_created,
  cocalc_last_active,
  stripe_customer_id,
  cocalc_tags,
  cocalc_notes,
  sign_up_usage_intent,
}) {
  const data = {
    first_name,
    last_name,
    email_address,
    tags: cocalc_tags,
    custom_fields: {
      cocalc_account_id,
      cocalc_created,
      cocalc_last_active,
      stripe_customer_id,
      cocalc_tags: cocalc_tags ? cocalc_tags.sort().join(",") : undefined,
      cocalc_notes,
      sign_up_usage_intent,
    },
  };
  // TODO: this is because the custom fields must be explicitly manually
  // entered into salesloft via the web ui!
  return data;
}

export async function addNewUsers(
  howLongAgo: string = "1 day",
  delayMs: number = 1000,
) {
  return await sync(
    await getAccountIds(
      `created IS NOT NULL AND created >= NOW() - interval '${howLongAgo}' AND salesloft_id IS NULL`,
    ),
    delayMs,
  );
}

export async function addActiveUsers(
  howLongAgo: string = "1 day",
  delayMs: number = 1000,
) {
  return await sync(
    await getAccountIds(
      `last_active >= NOW() - interval '${howLongAgo}' AND salesloft_id IS NULL`,
    ),
    delayMs,
  );
}

export async function updateActiveUsers(
  howLongAgo: string = "1 day",
  delayMs: number = 1000,
) {
  return await sync(
    await getAccountIds(
      `last_active >= NOW() - interval '${howLongAgo}' AND salesloft_id IS NOT NULL`,
    ),
    delayMs,
  );
}

async function getAccountIds(condition: string): Promise<string[]> {
  const db = getPool("long");
  const { rows } = await db.query(
    `SELECT account_id FROM accounts WHERE ${condition}`,
  );
  return rows.map(({ account_id }) => account_id);
}
