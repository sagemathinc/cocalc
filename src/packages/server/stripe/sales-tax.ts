/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Compute sales tax for a given customer in WA state.
*/

const { sales_tax } = require("@cocalc/backend/misc_node");
import getConn from "./connection";

export async function stripe_sales_tax(
  customer_id: string,
  dbg: Function
): Promise<number> {
  const conn = await getConn();
  const customer = await conn.customers.retrieve(customer_id);
  if (customer.deleted) {
    // mainly have this check so Typescript is happy
    dbg("customer was deleted");
    return 0;
  }
  if (customer.default_source == null) {
    dbg("no default source");
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
  dbg("tax: ", tax);
  return tax;
}
