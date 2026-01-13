/*
Email the full statement with given id to its owner, including *all* transactions.

If force is not true (always with API), this will fail if an attempt was made
to email this statement within the last hour.
*/

import getPool from "@cocalc/database/pool";
import type { Statement } from "@cocalc/util/db-schema/statements";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import dayjs from "dayjs";
import { statementToMarkdown, purchasesToMarkdown } from "./to-email";
import { getServerSettings } from "@cocalc/database/settings";
import siteURL from "@cocalc/database/settings/site-url";
import { disableDailyStatements } from "@cocalc/server/token-actions/create";
import { getTotalBalance } from "../get-balance";
import getLogger from "@cocalc/backend/logger";
import send, { support } from "@cocalc/server/messages/send";
import { toDecimal } from "@cocalc/util/money";

const logger = getLogger("purchases:email-statement");

export default async function emailStatement(opts: {
  account_id: string;
  statement_id: number;
  force?: boolean; // if not set, will send email at most once every 6 hours.
  dryRun?: boolean; // if set, returns content of message only, but doesn't send message (useful for unit testing)
}) {
  logger.debug("emailStatement ", opts);
  const { site_name: siteName, pay_as_you_go_min_payment } =
    await getServerSettings();
  const { account_id, statement_id, force, dryRun } = opts;
  const { name } = await getUser(account_id);
  const statement = await getStatement(statement_id);
  if (statement.account_id != account_id) {
    throw Error(
      `statement ${statement_id} does not belong to your account. Sign into the correct account.`,
    );
  }
  if (!force && statement.last_sent != null) {
    const hoursAgo = dayjs().diff(dayjs(statement.last_sent), "hour", true);
    if (hoursAgo <= 1) {
      throw Error(`statement already sent recently (wait at least an hour)`);
    }
  }
  let pay;
  const statementBalance = toDecimal(statement.balance);
  if (statementBalance.gte(0)) {
    pay = "**NO PAYMENT IS REQUIRED.**";
  } else {
    const totalBalance = toDecimal(await getTotalBalance(account_id));
    const minPayment = toDecimal(pay_as_you_go_min_payment ?? 0);
    if (totalBalance.gte(minPayment.neg())) {
      pay = "Your account is **fully paid**.";
    } else {
      pay = "You may receive an invoice soon.";
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
    stop = `\n\n[Disable Daily Statements (you will still receive monthly statements)...](${url})\n\n\n`;
  } else {
    stop = "";
  }

  const body = `
Dear ${name},

<br/>

Your ${
    statement.interval == "day" ? "Daily" : "Monthly"
  } statement is below.  You can also [browse an interactive
version of all statements](${link}) in your local timezone and download
your transactions as a CSV or JSON file.

${pay}

<br/>

${stop}

<br/>

${statementToMarkdown(statement, previousStatement, { siteName })}

---

${purchasesToMarkdown({ statement, purchases })}


<br/>

${await support()}

`;

  const mesg = { to_ids: [account_id], subject, body };

  if (!dryRun) {
    // actually send the message
    await send(mesg);
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
    [statement_id],
  );
  if (rows.length != 1) {
    throw Error(`no statement with id ${statement_id}`);
  }
  return rows[0];
}

async function getPreviousStatement(
  statement: Statement,
): Promise<Statement | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, interval, account_id, time, balance, total_charges, num_charges, total_credits, num_credits, last_sent FROM statements WHERE id<$1 AND account_id=$2 AND interval=$3 ORDER BY id DESC",
    [statement.id, statement.account_id, statement.interval],
  );
  if (rows.length != 1) {
    null;
  }
  return rows[0];
}

async function getPurchasesOnStatement(
  statement_id: number,
): Promise<Purchase[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, time, cost, cost_per_hour, period_start, period_end, service, description, project_id FROM purchases WHERE day_statement_id=$1 OR month_statement_id=$1 ORDER BY time desc",
    [statement_id],
  );
  return rows;
}

export async function getUser(
  account_id: string,
): Promise<{ name: string; email_address?: string }> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT first_name, last_name, email_address FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length != 1) {
    throw Error(`no account with id ${account_id}`);
  }
  const { first_name, last_name, email_address } = rows[0];
  return { name: `${first_name} ${last_name}`, email_address };
}
