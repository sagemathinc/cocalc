//import createPurchase from "./create-purchase";
//import createCredit from "./create-credit";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchase:create-purchase-from-invoice");

export default async function createPurchaseFromInvoiceId(
  invoice_id: string
): Promise<void> {
  logger.debug("invoice_id = ", invoice_id);

  throw Error("not implemented");
  //   // TODO: obviously this should be a single atomic database transaction.
  //   await createCredit({
  //     account_id,
  //     invoice_id,
  //     amount: price,
  //   });
  //   await createPurchase({
  //     account_id,
  //     invoice_id,
  //     cost: price,
  //     service: "license",
  //     description: { type: "license", info },
  //   });
}
