import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";

export default async function createPaymentMethod(
  account_id: string,
  token_id: string
): Promise<void> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  await stripe.createPaymentMethod(token_id);
}
