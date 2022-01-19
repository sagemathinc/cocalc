/*
Delete an item from the given user's shopping cart.  Item must be not be
already bought, but it can be "saved for later".  This is different than
just removing it, which saves it for later.

This really deletes the item from the cart, leaving no trace in the database.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

// we include the account_id to ensure here and in the query below
// to ensure there is an error if user A tries to delete an item
// from user B's shopping cart.

// Returns number of items "deleted".
export default async function deleteItem(
  account_id: string,
  id: number
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "DELETE FROM shopping_cart_items WHERE account_id=$1 AND id=$2 AND purchased IS NULL",
    [account_id, id]
  );
  return rowCount;
}
