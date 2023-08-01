/*
Email the full statement with given id to its owner, including *all* transactions.

If force is not true (always with API), this will fail if an attempt was made
to email this statement within the last hour.
*/

import getPool from "@cocalc/database/pool";
import type { Statement } from "@cocalc/util/db-schema/statements";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import dayjs from "dayjs";
import type { Message } from "@cocalc/server/email/message";
import sendEmail from "@cocalc/server/email/send-email";
import getLogger from "@cocalc/backend/logger";
import {
  statementToHtml,
  purchasesToHtml,
  statementToText,
  purchasesToText,
} from "./to-email";
import { getServerSettings } from "@cocalc/server/settings";
import siteURL from "@cocalc/server/settings/site-url";
import {
  disableDailyStatements,
  makePayment,
} from "@cocalc/server/token-actions/create";
import { getTotalBalance } from "../get-balance";
import { getUsageSubscription } from "../stripe-usage-based-subscription";
import { currency } from "@cocalc/util/misc";

const logger = getLogger("purchases:email-statement");

export default async function emailStatement(opts: {
  account_id: string;
  statement_id: number;
  force?: boolean; // if not set, will send email at most once every 6 hours.
  dryRun?: boolean; // if set, returns html content of email only, but doesn't send email (useful for unit testing)
}): Promise<Message> {
  logger.debug("emailStatement ", opts);
  const { help_email, site_name: siteName } = await getServerSettings();
  const { account_id, statement_id, force, dryRun } = opts;
  const { name, email_address: to } = await getUser(account_id);
  if (!to) {
    throw Error(`no email address on file for ${name}`);
  }
  const statement = await getStatement(statement_id);
  if (statement.account_id != account_id) {
    throw Error(
      `statement ${statement_id} does not belong to your account. Sign into the correct account.`
    );
  }
  if (!force && statement.last_sent != null) {
    const hoursAgo = dayjs().diff(dayjs(statement.last_sent), "hour", true);
    if (hoursAgo <= 1) {
      throw Error(`statement already sent recently (wait at least an hour)`);
    }
  }
  let pay;
  if (statement.balance >= 0) {
    pay = "Statement balance is not negative, so no payment is required.";
  } else {
    const usageSub = await getUsageSubscription(account_id);
    const toPay = currency(-statement.balance);
    if (usageSub == null) {
      const totalBalance = await getTotalBalance(account_id);
      if (totalBalance >= 0) {
        pay = "Your balance is no longer negative, so no payment is required.";
      } else {
        const payUrl = await makePayment({
          account_id,
          amount: -statement.balance,
        });
        pay = `<b><a href="${payUrl}">Click here to pay ${toPay}</a>, since you do NOT have automatic payments setup and your statement balance is negative.  You can also sign in and add money on <a href="${await siteURL()}/settings/purchases">the purchases page</a>.</b>`;
      }
    } else {
      pay = `You have automatic payments setup and your balance is currently ${toPay}. `;
      if (statement.automatic_payment) {
        pay += ` ${siteName} initiated a payment of ${toPay}.`;
      } else {
        pay += ` ${siteName} will soon initiate a payment of ${currency(
          -statement.balance
        )}.`;
      }
    }
  }

  const previousStatement = await getPreviousStatement(statement);

  // We do this before sending because it's partly to avoid abuse.
  await setLastSent(statement_id);

  const purchases = await getPurchasesOnStatement(statement_id);
  const subject = `${siteName} ${
    statement.interval == "day" ? "Daily" : "Monthly"
  } Statement - ${new Date(statement.time).toDateString()}`;

  const link = `${await siteURL()}/settings/statements`;
  let stop;
  if (statement.interval == "day") {
    const url = await disableDailyStatements(account_id);
    stop = `<a href="${url}">Disable Daily Statements (you will still receive monthly statements)...</a><br/><br/>`;
  } else {
    stop = "";
  }

  const html = `
Hello ${name},

<br/>
<br/>

Your ${
    statement.interval == "day" ? "Daily" : "Monthly"
  } statement is below.  You can browse an interactive
version of all statements in your local timezone at
<a href="${link}">${link}</a>
and download your transactions as a CSV or JSON file.

<br/>
<br/>
${pay}

<br/>
<br/>

If you have any questions, reply to this email to create
a support request.

<br/>
<br/>

${stop}


${statementToHtml(statement, previousStatement, { siteName })}

${purchasesToHtml(purchases)}

`;

  const text = `
Hello ${name},

Your ${
    statement.interval == "day" ? "Daily" : "Monthly"
  } statement is below.  You can browse an interactive
version of all statements in your local timezone at
${link}
and download your transactions as a CSV or JSON file.

${pay}

If you have any questions, reply to this email to create
a support request.

${stop}

${statementToText(statement, previousStatement, { siteName })}

---

${purchasesToText(purchases)}

`;

  const mesg = { from: help_email, to, subject, html, text };

  if (!dryRun) {
    // actually send email
    await sendEmail(mesg);
  }

  return mesg;
}

async function setLastSent(statement_id: number): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE statements SET last_sent=NOW() WHERE id=$1", [
    statement_id,
  ]);
}

async function getStatement(statement_id: number): Promise<Statement> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, interval, account_id, time, balance, total_charges, num_charges, total_credits, num_credits, last_sent, automatic_payment FROM statements WHERE id=$1",
    [statement_id]
  );
  if (rows.length != 1) {
    throw Error(`no statement with id ${statement_id}`);
  }
  return rows[0];
}

async function getPreviousStatement(
  statement: Statement
): Promise<Statement | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, interval, account_id, time, balance, total_charges, num_charges, total_credits, num_credits, last_sent FROM statements WHERE id<$1 AND account_id=$2 AND interval=$3 ORDER BY id DESC",
    [statement.id, statement.account_id, statement.interval]
  );
  if (rows.length != 1) {
    null;
  }
  return rows[0];
}

async function getPurchasesOnStatement(
  statement_id: number
): Promise<Purchase[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, time, cost, cost_per_hour, period_start, period_end, pending, service, description, project_id FROM purchases WHERE day_statement_id=$1 OR month_statement_id=$1 ORDER BY time desc",
    [statement_id]
  );
  return rows;
}

async function getUser(
  account_id: string
): Promise<{ name: string; email_address: string }> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT first_name, last_name, email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length != 1) {
    throw Error(`no account with id ${account_id}`);
  }
  const { first_name, last_name, email_address } = rows[0];
  return { name: `${first_name} ${last_name}`, email_address };
}
