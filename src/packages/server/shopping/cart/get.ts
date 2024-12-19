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
  // if true, same as payment_intent being set, but returns results for
  // all payment_intents.  I.e., everything that is currently processing.
  processing?: boolean;
  // if cart_id's is set get cart items with ids in this list as an alternative
  // to getting cart items with the given payment intent.  This is needed because
  // when using stripe checkout sessions, we don't have a way to set the
  // payment intent id on cart items in a fully robust way, so we rely on
  // cart ids via metadata instead when processing.
  cart_ids?: number[];
}

export default async function getCart({
  account_id,
  purchased,
  removed,
  payment_intent,
  processing,
  cart_ids,
}: Options): Promise<Item[]> {
  assertValidAccountID(account_id);
  const pool = getPool();

  let query;
  const params: any[] = [account_id];
  if (!payment_intent) {
    if (processing) {
      if (purchased || removed) {
        // cant be already purchased and still processing
        return [];
      }
      query = `
      SELECT * FROM shopping_cart_items
         WHERE account_id=$1
         AND purchased#>>'{success}' IS NULL
         AND (purchased#>>'{payment_intent}' IS NOT NULL OR id=ANY($2))
         AND removed IS NULL ORDER BY id DESC
     `;
      params.push(cart_ids ?? []);
    } else {
      query = `SELECT * FROM shopping_cart_items WHERE account_id=$1 AND purchased IS ${
        purchased ? " NOT " : ""
      } NULL AND removed IS ${removed ? " NOT " : ""} NULL ORDER BY id DESC`;
    }
  } else {
    let a;
    if (purchased) {
      a = `purchased#>>'{success}'='true'`;
    } else {
      a = `purchased#>>'{success}' IS NULL`;
    }
    query = `
    SELECT * FROM shopping_cart_items
       WHERE account_id=$1
          AND (purchased#>>'{payment_intent}'=$2 OR id=ANY($3))
          AND ${a}
          AND removed IS ${removed ? " NOT " : ""} NULL
          ORDER BY id DESC`;
    params.push(payment_intent);
    params.push(cart_ids ?? []);
  }
  const { rows } = await pool.query(query, params);
  if (!(purchased || removed)) {
    // for non-historical items we adjust the interval to be valid, e.g., can't buy license in the past
    await ensureValidLicenseIntervals(rows, pool);
  }
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
