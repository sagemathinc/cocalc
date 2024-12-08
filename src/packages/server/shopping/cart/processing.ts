/*
Get shopping cart items.  By default gets the current shopping cart,
but you can also get all items that have been removed from the cart,
and also all items that were purchased.
*/

import { assertValidAccountID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { Item } from "@cocalc/util/db-schema/shopping-cart-items";
export type { Item };

interface Options {
  account_id: string;
}

export default async function getProcessing({
  account_id,
}: Options): Promise<Item[]> {
  assertValidAccountID(account_id);
  const pool = getPool();

  const query = `
     SELECT * FROM shopping_cart_items
     WHERE account_id=$1
     AND purchased#>>'{payment_intent}' IS NOT NULL
     AND purchased#>>'{success}' IS NULL
     AND removed IS NULL
     ORDER BY id DESC`;
  const { rows } = await pool.query(query, [account_id]);
  return rows as any as Item[];
}
