/*
Edit an item in the user's shopping cart.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import {
  ProductType,
  ProductDescription,
} from "@cocalc/util/db-schema/shopping-cart-items";

interface Options {
  account_id: string;
  id: number;
  product?: ProductType;
  description?: ProductDescription;
}

export default async function editCart({
  account_id,
  id,
  product,
  description,
}): Promise<number> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  let query;
  const params = [account_id, id];
  if (product && description) {
    query =
      "UPDATE shopping_cart_iems SET product=$3, description=$4 WHERE account_id=$1 AND id=$2";
    params.push(product);
    params.push(description);
  } else if (product) {
    query =
      "UPDATE shopping_cart_iems SET product=$3 WHERE account_id=$1 AND id=$2";
    params.push(product);
  } else if (description) {
    query =
      "UPDATE shopping_cart_iems SET description=$3 WHERE account_id=$1 AND id=$2";
    params.push(description);
  } else {
    return 0; //nothing to change
  }
  query += " AND removed IS NULL AND purchased IS NULL";

  const { rowCount } = await pool.query(query, params);
  return rowCount;
}
