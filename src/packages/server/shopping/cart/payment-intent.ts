/*
Paying to buy something in the store and a payment intent has been created successfully.

We specially mark the items in the shopping cart
so that (1) double purchase is impossible, and (2) when the payment goes through, these
items can be provided to the user.
purchased is a jsonb field, and we set purchased.payment_intent to paymentIntentId
for every item in the active shopping cart.
*/

import getPool from "@cocalc/database/pool";

export default async function setShoppingCartPaymentIntent({
  account_id,
  payment_intent,
  cart_ids,
}: {
  account_id: string;
  payment_intent: string;
  cart_ids?: number[];
}) {
  let query =
    "UPDATE shopping_cart_items SET purchased=$1 WHERE account_id=$2 AND purchased IS NULL AND removed IS NULL";
  const params: any[] = [
    { payment_intent, checkout_time: new Date() },
    account_id,
  ];
  if (cart_ids != null && cart_ids.length > 0) {
    query += " AND id=ANY($3)";
    params.push(cart_ids);
  }
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  return rows;
}

export async function removeShoppingCartPaymentIntent({
  cart_ids,
}: {
  cart_ids: number[];
}) {
  const pool = getPool();
  await pool.query(
    "UPDATE shopping_cart_items SET purchased=NULL WHERE id=ANY($1)",
    [cart_ids],
  );
}
