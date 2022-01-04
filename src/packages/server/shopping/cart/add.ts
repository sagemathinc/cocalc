/*
Add an item to the given user's shopping cart.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import {
  ProductType,
  ProductDescription,
} from "@cocalc/util/db-schema/shopping-cart-items";

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
// Will only work for item that was actually removed
// and not purchased.
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
