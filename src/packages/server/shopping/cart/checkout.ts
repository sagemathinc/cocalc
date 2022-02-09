/*
Purchase everything that is checked and in the shopping cart.

This API endpoint gets called when user has confirmed their payment
method and clicked the button to complete the purchase.

Of course this doesn't take any input, since the contents of the cart
is already in the database, and the card info (and which is the default)
is in stripe only.

If this successfully runs, then the checked items in the shopping
cart are changed in the database so that the purchased field is set.
*/

import getCart from "./get";
import purchaseLicense from "@cocalc/server/licenses/purchase";
import getPool from "@cocalc/database/pool";
import {
  compute_cost,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/util";

export default async function checkout(account_id: string): Promise<void> {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  const cart = (
    await getCart({ account_id, purchased: false, removed: false })
  ).filter((item) => item.checked);

  // Purchase each item.
  // TODO: obviously, we should make one purchase that includes all the items
  // at once.  However, we haven't implemented that yet!  **We will soon.**
  const pool = getPool();
  for (const item of cart) {
    const license_id = await purchaseItem(item);
    await pool.query(
      "UPDATE shopping_cart_items SET purchased=$3 WHERE account_id=$1 AND id=$2",
      [account_id, item.id, { success: true, time: new Date(), license_id }]
    );
  }
}

async function purchaseItem(item): Promise<string> {
  const { product } = item;
  if (product != "site-license") {
    // This *ONLY* implements purchasing the site-license product, which is the only
    // one we have right now.
    throw Error("only the 'site-license' product is currently implemented");
  }
  return await purchaseSiteLicense(item);
}

async function purchaseSiteLicense(item): Promise<string> {
  const {
    title,
    description,
    user,
    run_limit,
    period,
    range,
    ram,
    cpu,
    disk,
    always_running,
    member,
    idle_timeout,
  } = item.description;
  const info: PurchaseInfo = {
    user,
    upgrade: "custom" as "custom",
    quantity: run_limit,
    subscription: (period == "range" ? "no" : period) as
      | "no"
      | "monthly"
      | "yearly",
    start: range?.[0] ? new Date(range?.[0]) : new Date(),
    end: range?.[1] ? new Date(range?.[1]) : undefined,
    custom_ram: ram,
    custom_dedicated_ram: 0,
    custom_cpu: cpu,
    custom_dedicated_cpu: 0,
    custom_disk: disk,
    custom_always_running: always_running,
    custom_member: member,
    custom_idle_timeout: idle_timeout,
    title,
    description,
  };
  info.cost = compute_cost(info);
  return await purchaseLicense(item.account_id, info, true); // true = no throttle; otherwise, only first item would get bought.
}
