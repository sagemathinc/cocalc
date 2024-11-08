/*
Get shopping cart items.  By default gets the current shopping cart,
but you can also get all items that have been removed from the cart,
and also all items that were purchased.
*/

import { assertValidAccountID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { Item } from "@cocalc/util/db-schema/shopping-cart-items";
export type { Item };
import { ensureValidLicenseIntervals } from "./validate";

interface Options {
  account_id: string;
  purchased?: boolean;
  removed?: boolean;
  // if payment_intent is set, only return items in the shopping cart that
  // should be purchased using this payment_intent.
  payment_intent?: string;
}

export default async function getCart({
  account_id,
  purchased,
  removed,
  payment_intent,
}: Options): Promise<Item[]> {
  assertValidAccountID(account_id);
  const pool = getPool();

  let query;
  const params = [account_id];
  if (!payment_intent) {
    query = `SELECT * FROM shopping_cart_items WHERE account_id=$1 AND purchased IS ${
      purchased ? " NOT " : ""
    } NULL AND removed IS ${removed ? " NOT " : ""} NULL ORDER BY id DESC`;
  } else {
    let a;
    if (purchased) {
      a = `purchased#>>'{success}'='true'`;
    } else {
      a = `purchased#>>'{success}' IS NULL`;
    }
    query = `SELECT * FROM shopping_cart_items WHERE account_id=$1 AND purchased#>>'{payment_intent}'=$2 AND ${a} AND removed IS ${removed ? " NOT " : ""} NULL ORDER BY id DESC`;
    params.push(payment_intent);
  }
  const { rows } = await pool.query(query, params);
  await ensureValidLicenseIntervals(rows, pool);
  return rows as any as Item[];
}

export async function getItem({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}): Promise<Item> {
  assertValidAccountID(account_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM shopping_cart_items WHERE account_id=$1 AND id=$2",
    [account_id, id],
  );
  if (rows.length == 0) {
    throw Error(`no item with id ${id}`);
  }
  return rows[0];
}
