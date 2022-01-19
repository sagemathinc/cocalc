/*
Get items that you recently purchased.  This is used
for congratulating you, providing links, etc.

We don't just give the last purchase so things are more stateless, and
so for now more than one item in the cart can be handled as multiple purchases.
Also, it seems generally useful to see all your recent purchases. The
client can sort from oldest to newest and clearly display the most recent
in a separate group.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { cmp } from "@cocalc/util/misc";
import { Item } from "@cocalc/util/db-schema/shopping-cart-items";

interface Options {
  account_id: string;
  recent?: string; // specify how recent.  Default is "1 week".
}

export default async function getRecentPurchases({
  account_id,
  recent,
}: Options): Promise<Item[]> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM shopping_cart_items WHERE account_id=$1 AND purchased IS NOT NULL AND (purchased#>>'{time}')::timestamptz >= NOW() - $2::interval`,
    [account_id, recent ?? "1 week"]
  );
  rows.sort((a, b) => -cmp(a.purchased?.time, b.purchased?.time));
  return rows;
}
