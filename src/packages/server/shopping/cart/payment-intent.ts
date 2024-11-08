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
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE shopping_cart_items SET purchased=$1 WHERE account_id=$2 AND purchased IS NULL AND removed IS NULL`,
    [{ payment_intent, checkout_time: new Date() }, account_id],
  );
  return rows;
}
