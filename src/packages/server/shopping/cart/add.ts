/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Add an item to the given user's shopping cart.

TODO/WORRY -- a user could (on purpose or due to a bug) create an unbounded
number of items in their cart, which would be bad for the database.
We need to worry about that at some point, e.g., by throttling or
checking periodically, then blacklisting...?  This isn't something of
any value to a spammer so it's very unlikely to be exploited maliciously.

I did add throttling to the api handler.
*/

import dayjs from "dayjs";

import getPool from "@cocalc/database/pool";
import {
  ProductDescription,
  ProductType,
} from "@cocalc/util/db-schema/shopping-cart-items";
import { isValidUUID } from "@cocalc/util/misc";
import { getItem } from "./get";
//import { getLogger } from "@cocalc/backend/logger";

//const logger = getLogger("server:shopping:cart:add");

export default async function addToCart(
  account_id: string,
  product: ProductType,
  description?: ProductDescription,
  project_id?: string,
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  if (typeof project_id !== "string" || !isValidUUID(project_id)) {
    project_id = undefined;
  }
  const range = description?.["range"];
  if (range != null && range.length == 2) {
    // Here range is of type [Date, Date].
    // subscriptions, etc.
    // if start time is <= now, mutate range shifting interval
    // over so that start = now.
    // This often happens with "buy it again" below obviously.
    const now = dayjs();
    const v = range.map((x) => dayjs(x));
    if (v[0] < now) {
      const duration = v[1].diff(v[0]);
      v[0] = now;
      v[1] = v[0].add(duration);
    }
    range[0] = v[0].toISOString();
    range[1] = v[1].toISOString();
  }

  const pool = getPool();
  const { rowCount } = await pool.query(
    `INSERT INTO shopping_cart_items (account_id, added, product, description, checked, project_id)
    VALUES($1, NOW(), $2, $3, true, $4)`,
    [account_id, product, description, project_id],
  );
  return rowCount ?? 0;
}

// Puts an item back in the cart that was removed.
// - Mutates item that was actually removed and not purchased.
export async function putBackInCart(
  account_id: string,
  id: number,
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE shopping_cart_items SET removed=NULL, checked=TRUE WHERE account_id=$1 AND id=$2 AND removed IS NOT NULL AND purchased IS NULL",
    [account_id, id],
  );
  return rowCount ?? 0;
}

// Makes copy of item that was purchased and puts it in the cart.
export async function buyItAgain(
  account_id: string,
  id: number,
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  // this throws an error if it doesn't return 1 item.
  const item = await getItem({
    id,
    account_id,
  });
  await addToCart(account_id, item.product, item.description);
  return 1;
}
