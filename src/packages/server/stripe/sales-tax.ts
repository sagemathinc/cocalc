/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
DEPRECATED!

Compute sales tax for a given customer in WA state.
*/

import sales_tax from "@cocalc/util/stripe/sales-tax";
import getConn from "./connection";
import getLogger from "@cocalc/backend/logger";
const log = getLogger("stripe:sales-tax");

export default async function salesTax(customer_id: string): Promise<number> {
  const conn = await getConn();
  const customer = await conn.customers.retrieve(customer_id, {
    expand: ["sources"],
  });
  if (customer.deleted) {
    // mainly have this check so Typescript is happy
    log.debug("customer was deleted");
    return 0;
  }
  if (customer.default_source == null) {
    log.debug("no default source");
    return 0;
  }
  let zip = undefined;
  if (customer.sources != null) {
    for (const x of customer.sources.data) {
      if (x.id == customer.default_source) {
        zip = (x as any).address_zip?.slice(0, 5); // as any due to bug in Stripe's types
        break;
      }
    }
  }
  if (zip == null) {
    return 0;
  }
  const tax = sales_tax(zip);
  log.debug("tax: ", tax);
  return tax;
}
