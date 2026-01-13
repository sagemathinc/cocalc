/*
For each account where the most recent recent statement with interval "month"
has a negative balance, we automatically create a payment intent for the
amount of the negative balance and message the account.

If the charge goes through, then the user will get credited to the account.

The relevant database schemas:

smc=# \d statements
                                            Table "public.statements"
      Column       |            Type             | Collation | Nullable |                Default
-------------------+-----------------------------+-----------+----------+----------------------------------------
 id                | integer                     |           | not null | nextval('statements_id_seq'::regclass)
 interval          | text                        |           |          |
 account_id        | uuid                        |           |          |
 time              | timestamp without time zone |           |          |
 balance           | real                        |           |          |
 paid_purchase_id  | integer                     |           |          |
 automatic_payment | timestamp without time zone |           |          |
 ...

smc=# \d accounts
                                  Table "public.accounts"
           Column            |            Type             | Collation | Nullable | Default
-----------------------------+-----------------------------+-----------+----------+---------
 account_id                  | uuid                        |           | not null |
 stripe_usage_subscription   | character varying(256)      |           |          |
...
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import {
  collectPayment,
  hasUsageSubscription,
} from "./stripe-usage-based-subscription";
import { getServerSettings } from "@cocalc/database/settings";
import createPaymentIntent from "@cocalc/server/purchases/stripe/create-payment-intent";
import { hasPaymentMethod } from "@cocalc/server/purchases/stripe/get-payment-methods";
import { moneyToCurrency, toDecimal } from "@cocalc/util/money";
import send, { support, url } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";

const logger = getLogger("purchase:maintain-automatic-payments");

// GPT-4 and I wrote this QUERY after a lot of back and forth.  It finds all the
// relevant statements that we need to do automatic payments on in one
// single query to the database.   It's careful to only consider the MOST
// RECENT monthly statement and ignore any older ones.
// The subquery latest_statements gives the statements with interval 'month'
// but no other condition (except that the account has stripe_usage_subscription
// not null) and uses the ROW_NUMBER() trick so we can grab the most recent one.
// That's used to make a query that pull out just the latest_statements that
// have both automatic_payment and paid_purchase_id both NULL.
const QUERY = `
WITH latest_statements AS (
  SELECT
    a.account_id,
    s.id as statement_id,
    s.balance,
    s.time,
    s.automatic_payment,
    s.automatic_payment_intent_id,
    s.paid_purchase_id,
    ROW_NUMBER() OVER(PARTITION BY a.account_id ORDER BY s.time DESC) AS rn
  FROM
    accounts a
  JOIN
    statements s
    ON a.account_id = s.account_id
  WHERE
    a.stripe_usage_subscription IS NOT NULL
    AND s.interval = 'month'
)
SELECT
  account_id,
  balance,
  statement_id,
  time
FROM
  latest_statements
WHERE
  rn = 1
  AND automatic_payment IS NULL
  AND automatic_payment_intent_id IS NULL
  AND paid_purchase_id IS NULL
  AND balance < 0;
`;

export default async function maintainAutomaticPayments() {
  const { pay_as_you_go_min_payment, site_name } = await getServerSettings();

  const pool = getPool();
  const { rows } = await pool.query(QUERY);
  logger.debug("Got ", rows.length, " statements to automatically pay");
  for (const { time, account_id, balance, statement_id } of rows) {
    const balanceValue = toDecimal(balance);
    const description = `Pay statement ${statement_id} with balance ${moneyToCurrency(balanceValue)} from ${time}`;
    logger.debug(description);
    const amount = balanceValue.neg();
    try {
      // Set that automatic_payment has been *processed* for this statement.
      // This only means there was an actual payment attempt if the balance was negative.
      await pool.query(
        "UPDATE statements SET automatic_payment=NOW() WHERE id=$1",
        [statement_id],
      );
      if (balanceValue.gte(0)) {
        // should never happen
        continue;
      }
      logger.debug(
        "Since amount ",
        amount.toString(),
        " is positive, may try to collect automatically",
      );

      const minPayment = toDecimal(pay_as_you_go_min_payment ?? 0);
      if (amount.lt(minPayment)) {
        logger.debug(
          "amount is below min payment, so we do not charge anything for now. the min payment amount is ",
          pay_as_you_go_min_payment,
        );
        await send({
          to_ids: [account_id],
          subject: "Payment for Monthly Statement",
          body: `
The amount due on your monthly statement is ${moneyToCurrency(amount)}.
However, this is below the minimum payment size of ${moneyToCurrency(minPayment)}.
You will not be billed this month, and your balance will roll over to your next statement.

- [Your Statements](${await url("settings", "statements")})

${await support()}
`,
        });
        continue;
      }

      // Now make the attempt.  This might work quickly, it might take a day, it might
      // never succeed, it might throw an error.  That's all ok.
      if (mockCollectPayment != null) {
        await mockCollectPayment({ account_id, amount: amount.toNumber() });
      } else {
        // This should  eventually "work", but we might not get the money until later.
        const { payment_intent, hosted_invoice_url } =
          await createPaymentIntent({
            account_id,
            lineItems: [
              {
                description: `Credit account to cover balance on statement ${statement_id}`,
                amount: amount.toNumber(),
              },
            ],
            // this purpose format is assumed in server/purchases/stripe/process-payment-intents.ts
            purpose: `statement-${statement_id}`,
            description,
          });

        // Inform user that this happened.
        await send({
          to_ids: [account_id],
          subject: "Payment for Monthly Statement",
          body: `
${site_name} issued an invoice for the balance of ${moneyToCurrency(amount)} that is due on your monthly statement id=${statement_id}.

- Statements: ${await url("settings", "statements")}

- Hosted Invoice: ${hosted_invoice_url}

${await support()}`,
        });
        await pool.query(
          "UPDATE statements SET automatic_payment_intent_id=$1 WHERE id=$2",
          [payment_intent, statement_id],
        );
      }
    } catch (err) {
      logger.debug(`WARNING - error trying to collect payment: ${err}`);
      await send({
        to_ids: [account_id],
        subject: "Payment for Monthly Statement -- Error",
        body: `
The amount due on your monthly statement is ${moneyToCurrency(amount)}.
When attempting to automatically charge you, an error occured.

${err}

- [Your Statements](${await url("settings", "statements")})

${await support()}
`,
      });
      adminAlert({
        subject: `Weird error when running automatic monthly payment of a statement`,
        body: `
When running an automatic monthly payment for account_id=${account_id}, statement_id=${statement_id},
something weird and unexpected went wrong. Somebody should investigate.

${err}
`,
      });
    }
  }
}

// This is a hook to mock payment collection, which is very helpful for unit testing,
// so we know exactly what happened and don't have to involve stripe...
let mockCollectPayment: null | typeof collectPayment = null;
export function setMockCollectPayment(f: any) {
  mockCollectPayment = f;
}

export async function hasUsageBasedSubscriptionButNoPaymentMethods(
  account_id: string,
) {
  if (!(await hasUsageSubscription(account_id))) {
    // doesn't have a usage based subscription
    return false;
  }
  if (await hasPaymentMethod(account_id)) {
    // has a payment method
    return false;
  }
  return true;
}
