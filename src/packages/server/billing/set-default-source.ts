import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";

export default async function setDefaultSource(
  account_id: string,
  default_source: string
): Promise<void> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  await stripe.setDefaultSource(default_source);
}
