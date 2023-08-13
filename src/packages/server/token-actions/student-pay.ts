import createStripeCheckoutSession from "@cocalc/server/purchases/create-stripe-checkout-session";
import { currency } from "@cocalc/util/misc";
import getName from "@cocalc/server/accounts/get-name";
import { getTokenUrl } from "./create";
import studentPayPurchase from "@cocalc/server/purchases/student-pay";

export default async function studentPay(
  token,
  description,
  account_id
): Promise<any> {
  if (description.due > 0) {
    const amount = description.due;
    const user = await getName(account_id);
    const url = await getTokenUrl(token);
    const session = await createStripeCheckoutSession({
      account_id,
      amount,
      description: `Add ${currency(
        amount
      )} to your account (signed in as ${user}).`,
      success_url: url,
      cancel_url: url,
      force: true,
    });
    return {
      session,
      instructions: `Click here to deposit ${currency(
        amount
      )} into ${user}'s account...`,
    };
  } else {
    // should have enough money, so actually make the purchase
    return await studentPayPurchase({
      account_id,
      project_id: description.project_id,
      allowOther: true,
    });
  }
}
