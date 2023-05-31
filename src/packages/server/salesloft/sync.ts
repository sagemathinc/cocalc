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

- custom_fields:
  - cocalc_account_id: the cocalc account_id
  - cocalc_created: date when cocalc account was created (UTC timestamp)
  - cocalc_last_active: date when cocalc account was last active (UTC timestamp)
  - stripe_customer_id: if they interacted with our payment system, they will have a stripe id
  - cocalc_tags: if they entered tags when creating their account
  - cocalc_notes: if we typed in notes about them via our CRM

Later, we will also try to provide more interesting information.  But this should be something
to get started.
*/

import getPool from "@cocalc/database/pool";
import { create, list, update } from "./people";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("salesloft:sync");
const log = logger.debug.bind(logger);

export async function sync(
  account_ids: string[]
): Promise<{ update: number; create: number }> {
  const cocalc = getPool("long");

  log(
    "get all data we will need from cocalc's database about ",
    account_ids.length,
    "accounts"
  );
  const { rows } = await cocalc.query(
    "SELECT account_id AS cocalc_account_id, salesloft_id, created AS cocalc_created, last_active AS cocalc_last_active, stripe_customer_id, tags AS cocalc_tags, notes AS cocalc_notes, email_address, first_name, last_name FROM accounts WHERE account_id=ANY($1) AND email_address IS NOT NULL",
    [account_ids]
  );
  log("got ", rows.length, " records with an email address");

  const stats = { update: 0, create: 0 };
  for (const row of rows) {
    log("considering ", row.email_address);
    const data = toSalesloft(row);
    if (row.salesloft_id) {
      log(
        "already exists in salesloft with salesloft_id = ",
        row.salesloft_id,
        "so updating..."
      );
      // person already exists in salesloft, so update it
      await update(row.salesloft_id, data);
      stats.update += 1;
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
        salesloft_id
      );
      await cocalc.query(
        "UPDATE accounts SET salesloft_id=$1 WHERE account_id=$2",
        [salesloft_id, row.cocalc_account_id]
      );
    }
  }
  return stats;
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
}) {
  const data = {
    first_name,
    last_name,
    email_address,
    custom_fields: {
      cocalc_account_id,
      cocalc_created,
      cocalc_last_active,
      stripe_customer_id,
      cocalc_tags,
      cocalc_notes,
    },
  };
  // TODO: this is because the custom fields must be explicitly manually
  // entered into salesloft via the web ui!
  return data;
}

// account_id's that were active during the given Date range.
export async function addActiveUsers(howLongAgo: string = "1 day") {
  const db = getPool("long");
  const { rows } = await db.query(
    `SELECT account_id FROM accounts WHERE last_active >= NOW() - interval '${howLongAgo}' AND salesloft_id IS NULL`
  );
  const account_ids = rows.map(({ account_id }) => account_id);
  return await sync(account_ids);
}
