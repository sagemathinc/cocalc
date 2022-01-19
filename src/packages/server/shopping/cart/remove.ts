/*
Remove an item from the given user's shopping cart.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

// we include the account_id to ensure here and in the query below
// to ensure there is an error if user A tries to delete an item
// from user B's shopping cart.

// Returns number of items "removed", which on success is 0 or 1.
//   0 - item with that id wasn't in the cart
//   1 - item was changed.
// You can't remove an item more than once from a cart.
export default async function removeFromCart(
  account_id: string,
  id: number
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE shopping_cart_items SET removed=NOW() WHERE account_id=$1 AND id=$2 AND removed IS NULL AND purchased IS NULL",
    [account_id, id]
  );
  return rowCount;
}

