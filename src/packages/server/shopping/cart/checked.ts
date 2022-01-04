/*
Set the checked state in the database for an item in the shopping cart.

Returns number of modified items (which should be 0 or 1).
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

export default async function setCheck(
  account_id: string,
  id: number,
  checked: boolean
): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE shopping_cart_items SET checked=$3 WHERE id=$1 AND account_id=$2",
    [account_id, id, checked]
  );
  return rowCount;
}
