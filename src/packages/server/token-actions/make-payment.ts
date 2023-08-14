/*

export interface MakePayment {
  type: "make-payment";
  account_id: string;
  amount: number;
}
*/

import type { MakePayment } from "@cocalc/util/db-schema/token-actions";
import createStripeCheckoutSession from "@cocalc/server/purchases/create-stripe-checkout-session";
import { currency } from "@cocalc/util/misc";
import getName from "@cocalc/server/accounts/get-name";
import { getResultUrl } from "./create";

export default async function makePayment(description: MakePayment) {
  const { account_id, amount } = description;
  const user = await getName(account_id);
  const success_url = await getResultUrl(
    `Successfully added ${currency(amount)} to ${user}'s account!`
  );
  const cancel_url = await getResultUrl(
    `Did NOT add ${currency(amount)} to ${user}'s account.`
  );
  const session = await createStripeCheckoutSession({
    account_id,
    amount,
    description: `Add ${currency(amount)} to ${user}'s account.`,
    success_url,
    cancel_url,
    force: true,
  });
  return {
    type: "create-credit",
    session,
    instructions: `Click here to deposit ${currency(
      amount
    )} into ${user}'s account...`,
  };
}
