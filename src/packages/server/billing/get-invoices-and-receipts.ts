import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";

export default async function getInvoicesAndReceipts(
  account_id: string
): Promise<object[]> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  const mesg = await stripe.mesg_get_invoices({});
  return mesg.invoices;
}
