/*
DEPRECATED!!


export interface MakePayment {
  type: "make-payment";
  account_id: string;
  amount: number;
}
*/

import type { MakePayment } from "@cocalc/util/db-schema/token-actions";
import { currency } from "@cocalc/util/misc";
import getName from "@cocalc/server/accounts/get-name";
import getPool from "@cocalc/database/pool";
import syncPaidInvoices from "@cocalc/server/purchases/sync-paid-invoices";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";

export default async function makePayment(
  token: string,
  description: MakePayment,
) {
  const { account_id, amount } = description;
  const user = await getName(account_id);
  return {
    type: "create-credit",
    pay: {
      description: `Add ${currency(amount)} to ${user}'s account.`,
      purpose: `token-${token}`,
      lineItems: [
        {
          description: `${currency(amount)} credit for ${user}'s account.`,
          amount,
        },
      ],
    },
    instructions: `Click here to deposit ${currency(
      amount,
    )} into ${user}'s account...`,
  };
}

export async function extraInfo(description, token) {
  const user = `${await getName(
    description.account_id,
  )} (${await getEmailAddress(description.account_id)})`;
  if (description.paid) {
    // already paid
    return {
      ...description,
      title: "Make Payment -- PAID",
      details: `Payment of ${currency(
        description.amount,
        2,
      )} to the account of ${user} completed. Thank you!

${description.reason ? "\n\n- " + description.reason : ""}
`,
      okText: "",
      cancelText: "Close",
      icon: "credit-card",
    };
  }
  // just in case webhook doesn't get it
  if ((await syncPaidInvoices(description.account_id)) > 0) {
    if (token) {
      // > 0 means we handled at least one new invoice, so maybe
      // description.paid changed.
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT description FROM token_actions WHERE token=$1",
        [token],
      );
      // don't pass token back in so no chance of infinite loop.
      return await extraInfo(rows[0]?.description, "");
    }
  }

  return {
    ...description,
    title: `Make Payment -- ${currency(description.amount, 2)}`,
    details: `Make a payment of ${currency(
      description.amount,
      2,
    )} to the account of ${user}.
${description.reason ? "\n\n- " + description.reason : ""}
    `,
    okText: "Make Payment",
    icon: "calendar",
  };
}

export async function markTokenActionPaid(token: string) {
  const pool = getPool();
  await pool.query(
    `UPDATE token_actions
     SET description=jsonb_set(description, '{paid}', $1)
     WHERE token=$2`,
    [Date.now(), token],
  );
}
