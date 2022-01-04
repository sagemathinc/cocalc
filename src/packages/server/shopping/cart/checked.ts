/*
Set the checked state in the database for an item in the shopping cart.

If id is not set, sets checked state for all items in shopping cart.

Returns number of modified items.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

export default async function setCheck(
  account_id: string,
  checked: boolean,
  id?: number
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();

  let query =
    "UPDATE shopping_cart_items SET checked=$1 WHERE account_id=$2 AND removed IS NULL AND purchased IS NULL";
  const params = [checked, account_id];
  if (id != null) {
    query += " AND id=$3 ";
    params.push(id);
  }

  const { rowCount } = await pool.query(query, params);
  return rowCount;
}
