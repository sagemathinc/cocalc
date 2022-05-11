/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Add an item to the given user's shopping cart.

TODO/WORRY -- a user could (on purpose or due to a bug) create an unbounded
number of items in their cart, which would be bad for the database.
We need to worry about that at some point, e.g., by throttling or
checking periodically, then blacklisting...?  This isn't something of
any value to a spammer so it's very unlikely to be exploited maliciously.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import {
  ProductType,
  ProductDescription,
} from "@cocalc/util/db-schema/shopping-cart-items";
import { getItem } from "./get";

export default async function addToCart(
  account_id: string,
  product: ProductType,
  description?: ProductDescription
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "INSERT INTO shopping_cart_items (account_id, added, product, description, checked) VALUES($1,NOW(),$2,$3,true)",
    [account_id, product, description]
  );
  return rowCount;
}

// Puts an item back in the cart that was removed.
// - Mutates item that was actually removed and not purchased.
export async function putBackInCart(
  account_id: string,
  id: number
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE shopping_cart_items SET removed=NULL, checked=TRUE WHERE account_id=$1 AND id=$2 AND removed IS NOT NULL AND purchased IS NULL",
    [account_id, id]
  );
  return rowCount;
}

// Makes copy of item that was purchased and puts it in the cart.
export async function buyItAgain(
  account_id: string,
  id: number
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  // this errors if it doesn't return 1 item.
  const item = await getItem({
    id,
    account_id,
  });
  await addToCart(account_id, item.product, item.description);
  return 1;
}
