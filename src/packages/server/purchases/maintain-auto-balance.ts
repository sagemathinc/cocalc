/*
Maintain automatic balance increases.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import createPaymentIntent from "@cocalc/server/purchases/stripe/create-payment-intent";
import { currency, round2up } from "@cocalc/util/misc";
import getBalance from "./get-balance";
import { getAllOpenPayments } from "@cocalc/server/purchases/stripe/get-payments";
import { AUTO_CREDIT } from "@cocalc/util/db-schema/purchases";
import { AUTOBALANCE_DEFAULTS } from "@cocalc/util/db-schema/accounts";
import send, { support, url } from "@cocalc/server/messages/send";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { decimalAdd } from "@cocalc/util/stripe/calc";
import {
  type AutoBalance,
  ensureAutoBalanceValid,
} from "@cocalc/util/db-schema/accounts";

const logger = getLogger("purchase:maintain-auto-balance");

export default async function maintainAutoBalance() {
  logger.debug("maintainAutoBalance");
  const pool = getPool();

  // These are very obviously accounts we should investigate:
  const { rows: rows1 } = await pool.query(`
      SELECT account_id, auto_balance FROM accounts
           WHERE auto_balance IS NOT NULL
           AND auto_balance->>'enabled' = 'true'
           AND balance IS NOT NULL
           AND banned IS NOT TRUE
           AND (auto_balance#>'{trigger}')::numeric >= balance
       `);
  const accounts = new Set(rows1.map((x) => x.account_id));
  logger.debug(
    `maintainAutoBalance: got ${accounts.size} accounts that obviously need to be investigated`,
  );
  // Due to unobserved pay as you go purchases, the actual user balance can be going down quickly at any
  // time if there are open purchases.  So we also grab all accounts with active open recent PAYG purchases
  // that have auto payments configured.
  const { rows: rows2 } = await pool.query(`
      SELECT accounts.account_id AS account_id, accounts.auto_balance AS auto_balance FROM purchases, accounts
           WHERE purchases.account_id = accounts.account_id
           AND purchases.time >= NOW() - INTERVAL '1 week'
           AND purchases.cost IS NULL
           AND (purchases.cost_per_hour IS NOT NULL OR purchases.cost_so_far IS NOT NULL)
           AND accounts.auto_balance IS NOT NULL
           AND auto_balance->>'enabled' = 'true'
       `);
  const n = accounts.size;
  for (const { account_id } of rows2) {
    accounts.add(account_id);
  }
  logger.debug(
    `maintainAutoBalance: got ${accounts.size - n} additional accounts involving pay as you go`,
  );
  if (accounts.size == 0) {
    return;
  }

  const auto_balances: { [account_id: string]: AutoBalance } = {};
  for (const { account_id, auto_balance } of rows1.concat(rows2)) {
    auto_balances[account_id] = auto_balance;
  }

  // Now we maintain auto balance for each of these accounts.
  // Initially, likely there will be very few such users, but eventually
  // we'll need tricks to make this more efficient.   In particular,
  // we should make getBalance more efficient.
  for (const account_id of accounts) {
    try {
      const { reason, status } = await update({
        account_id,
        auto_balance: auto_balances[account_id],
      });
      logger.debug(`maintainAutoBalance: ${account_id} -- `, {
        reason,
        status,
      });
      if (status != null) {
        await pool.query(
          `
        UPDATE accounts
          SET auto_balance = auto_balance || jsonb_build_object('reason', $2::text, 'status', $3::jsonb, 'time', $4::numeric)
          WHERE account_id = $1`,
          [account_id, reason, status, Date.now()],
        );
      } else {
        await pool.query(
          `
        UPDATE accounts
          SET auto_balance = auto_balance || jsonb_build_object('reason', $2::text, 'time', $3::numeric)
          WHERE account_id = $1`,
          [account_id, reason, Date.now()],
        );
      }
    } catch (err) {
      logger.debug(
        `WARNING -- issue updating balance for ${account_id}: ${err}`,
      );
      try {
        await pool.query(
          `
          UPDATE accounts
            SET auto_balance = auto_balance || jsonb_build_object('reason', $2::text)
            WHERE account_id = $1
          `,
          [account_id, `ERROR: ${err}`],
        );
      } catch (_err) {}
    }
  }
}

const ONE_DAY = 1000 * 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_MONTH = ONE_DAY * 30.5;

// we assume this isn't called more than once with the same input -- it should be used only
// in the singleton maintenance hub!
async function update({
  account_id,
  auto_balance,
}: {
  account_id: string;
  auto_balance: AutoBalance;
}): Promise<{
  reason: string;
  status?: { day: number; week: number; month: number };
}> {
  logger.debug("update: considering ", { account_id, auto_balance });
  // should we? many reasons not to?
  ensureAutoBalanceValid(auto_balance);
  // shouldn't possibly be broken, but just in case...
  if (!auto_balance.enabled) {
    // db query should have filtered this, but just in case.
    return { reason: "Not Enabled" };
  }

  const balance = await getBalance({ account_id });
  logger.debug("update: balance = ", balance);

  if (balance > auto_balance.trigger) {
    return { reason: "balance > trigger, so nothing to do" };
  }

  // we will add a credit, UNLESS any of the following are true:
  //  - we have already added auto_balance.max_day credit during the last 24 hours
  //  - we have already added auto_balance.max_week credit during the last week
  //  - we have already added auto_balance.max_month credit during the last month
  // We just grab the timestamps and amounts for every time we added balance during the last month
  // instead of doing 3 database queries.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT time, cost FROM purchases WHERE account_id=$1 AND service='auto-credit' AND time >= NOW() - interval '1 month'",
    [account_id],
  );
  const period = auto_balance.period ?? AUTOBALANCE_DEFAULTS.period;
  let amount_day = 0;
  let amount_week = 0;
  let amount_month = 0;
  const now = Date.now();
  for (const { time, cost } of rows) {
    const t = time.valueOf();
    if (period == "day" && now - t <= ONE_DAY) {
      amount_day += -cost;
      if (amount_day + auto_balance.amount >= auto_balance.max_day) {
        return {
          reason: `daily threshold of ${currency(auto_balance.max_day)} would be exceeded since ${currency(amount_day)} was already added during the last day, so not adding money`,
        };
      }
    }
    if (period == "week" && now - t <= ONE_WEEK) {
      amount_week += -cost;
      if (amount_week + auto_balance.amount >= auto_balance.max_week) {
        return {
          reason: `weekly threshold of ${currency(auto_balance.max_week)} would be exceeded since ${currency(amount_week)} was already added during the last week, so not adding money`,
        };
      }
    }
    if (period == "month" && now - t <= ONE_MONTH) {
      amount_month += -cost;
      if (amount_month + auto_balance.amount >= auto_balance.max_month) {
        return {
          reason: `monthly threshold of ${currency(auto_balance.max_month)} would be exceeded since ${currency(amount_month)} was already added during the last month, so not adding money`,
        };
      }
    }
  }

  //  - there are any open payments, e.g., user's credit card isn't working
  const openPayments = await getAllOpenPayments(account_id);
  if (openPayments.data.length > 0) {
    return {
      reason: "not adding balance because there are current open payments",
    };
  }

  logger.debug("update: no problems -- let's do it!");
  // but what exactly?
  // we can add this amount as cleared above
  let amount = auto_balance.amount;
  if (balance + amount <= auto_balance.trigger) {
    // it won't be enough -- can we add more?
    let remaining; // the most we can add
    if (period == "day") {
      remaining = auto_balance.max_day - amount_day - amount;
    } else if (period == "week") {
      remaining = auto_balance.max_week - amount_week - amount;
    } else {
      remaining = auto_balance.max_month - amount_month - amount;
    }
    const want = auto_balance.trigger - (balance + amount);
    amount += Math.min(want, remaining);
  }
  amount = round2up(amount);

  const result = decimalAdd(balance, amount);
  const longDescription = `Deposit ${currency(amount)} to increase balance from ${currency(balance)} to ${currency(result)}, to keep balance above ${currency(auto_balance.trigger)}.`;
  const shortDescription = `Deposit ${currency(amount)} since balance went below ${currency(auto_balance.trigger)}.`;
  await createPaymentIntent({
    account_id,
    lineItems: [{ description: longDescription, amount }],
    description: shortDescription,
    purpose: AUTO_CREDIT,
  });

  try {
    await sendAutoBalanceAlert({
      account_id,
      description: longDescription,
      amount,
    });
  } catch (err) {
    logger.debug(
      `WARNING: issue sending auto-balance email ${account_id} ${longDescription} -- ${err}`,
    );
  }

  const status = {
    day: amount_day + amount,
    week: amount_week + amount,
    month: amount_month + amount,
  };

  return { reason: longDescription, status };
}

async function sendAutoBalanceAlert({ account_id, description, amount }) {
  const { name } = await getUser(account_id);
  const subject = `Automatic Deposit of ${currency(amount)} Initiated`;

  const body = `
Dear ${name},

You have automatic deposits enabled, which just started the following:

${description}

This should completely quickly if you have a valid payment method on file.
If not, please enter any required information, or cancel the payment.

- [Your Payments](${await url("settings", "payments")})

${await support()}
`;

  await send({ to_ids: [account_id], subject, body });
}
