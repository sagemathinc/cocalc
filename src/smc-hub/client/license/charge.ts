/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PurchaseInfo } from "smc-webapp/site-licenses/purchase/util";
import { StripeClient } from "../../stripe/client";

export async function charge_user_for_license(
  stripe: StripeClient,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<void> {
  dbg("getting product_id");
  const product_id = await stripe_get_product(stripe, info);
  dbg("got product_id", product_id);
  if (info.subscription == "no") {
    await stripe_purchase_product(stripe, product_id, info.quantity);
  } else {
    await stripe_create_subscription(
      stripe,
      product_id,
      info.quantity,
      info.subscription
    );
  }
}

function get_days(info): number {
  if (info.start == null || info.end == null) throw Error("bug");
  return Math.round(
    (info.end.valueOf() - info.start.valueOf()) / (24 * 60 * 60 * 1000)
  );
}

function get_product_id(info: PurchaseInfo): string {
  /* We generate a unique identifier that represents the parameters of the purchase.
     The following parameters determine what "product" they are purchasing:
        - custom_always_running
        - custom_cpu
        - custom_disk
        - custom_member
        - custom_ram
        - period: subscription or set number of days
      We encode these in a string which serves to identify the product.
  */
  let period: string;
  if (info.subscription == "no") {
    period = get_days(info).toString();
  } else {
    period = "0"; // 0 means "subscription" -- same product for all types of subscription billing;
  }
  return `license_a${info.custom_always_running ? 1 : 0}b${
    info.user == "business" ? 1 : 0
  },c${info.custom_cpu}d${info.custom_disk}m${
    info.custom_member ? 1 : 0
  }p${period}r${info.custom_ram}`;
}

function get_product_name(info): string {
  /* Similar to get_product_id above, but meant to be human readable.  This name is what
     customers see on invoices, so it's very valuable as it reflects what they bought clearly.
  */
  let period: string;
  if (info.subscription == "no") {
    period = `${get_days(info)} days`;
  } else {
    period = "subscription";
  }
  let desc = info.user == "business" ? "License" : "Academic license";
  desc += ` for ${info.custom_ram}GB RAM, ${info.custom_cpu} CPU, ${info.custom_disk}GB disk`;
  if (info.custom_member) {
    desc += ", member host";
  }
  if (info.always_running) {
    desc += ", always running";
  }
  desc += ", " + period;
  return desc;
}

function get_product_metadata(info): object {
  return {
    user: info.user,
    ram: info.custom_ram,
    cpu: info.custom_cpu,
    disk: info.custom_disk,
    always_running: info.custom_always_running,
    member: info.custom_member,
    subscription: info.subscription,
    start: info.start,
    end: info.end,
  };
}

async function stripe_get_product(
  stripe: StripeClient,
  info: PurchaseInfo
): Promise<string> {
  const product_id = get_product_id(info);
  // check to see if the product has already been created; if not, create it.
  if (!(await stripe_product_exists(stripe, product_id))) {
    // now we have to create the product.
    const metadata = get_product_metadata(info);
    const name = get_product_name(info);
    await stripe.call_stripe_api("products", "create", {
      id: product_id,
      name,
      metadata,
    });
    // Add the pricing info:
    //  - if sub then we set the price for monthly and yearly.
    //  - if number of days, we set price for that many days.
    if (info.cost == null) throw Error("cost must be defined");
    if (info.subscription == "no") {
      // create the one-time cost
      await stripe.call_stripe_api("prices", "create", {
        currency: "usd",
        unit_amount: Math.round((info.cost.cost / info.quantity) * 100),
        product: product_id,
      });
    } else {
      // create the two recurring subscription costs
      await stripe.call_stripe_api("prices", "create", {
        currency: "usd",
        unit_amount: Math.round(info.cost.cost_sub_month * 100),
        product: product_id,
        recurring: { interval: "month" },
      });
      await stripe.call_stripe_api("prices", "create", {
        currency: "usd",
        unit_amount: Math.round(info.cost.cost_sub_year * 100),
        product: product_id,
        recurring: { interval: "year" },
      });
    }
  }
  return product_id;
}

async function stripe_product_exists(
  stripe: StripeClient,
  product_id: string
): Promise<boolean> {
  try {
    await stripe.call_stripe_api("products", "retrieve", product_id);
    return true;
  } catch (_) {
    return false;
  }
}

async function stripe_purchase_product(
  stripe: StripeClient,
  product_id: string,
  quantity: number
): Promise<void> {
  const customer: string = await stripe.need_customer_id();

  // TODO: we should probably check that this exists and if not create it...
  // right now manually creating it will make things work.
  // but that is pretty fragile! this should be the "25% off web discount"
  const coupon = "online-discount";

  const prices = await stripe.call_stripe_api("prices", "list", {
    product: product_id,
    type: "one_time",
    active: true,
  });
  const price = prices.data[0];
  if (price == null) {
    // TODO -- or we could create it?
    throw Error(
      `price for one-time purchase missing -- product_id="${product_id}"`
    );
  }

  // TODO: improve later to handle case of *multiple* items on one invoice
  const options: any = {
    customer,
    auto_advance: true,
    collection_method: "charge_automatically",
    items: [{ price, quantity }],
    quantity,
    coupon,
  };

  const tax_percent = await stripe.sales_tax(customer);
  if (tax_percent) {
    // TODO: tax_percent is DEPRECATED (see stripe_create_subscription below).
    options.tax_percent = Math.round(tax_percent * 100 * 100) / 100;
  }

  await stripe.call_stripe_api("invoices", "create", options);
  await stripe.update_database();
}

async function stripe_create_subscription(
  stripe: StripeClient,
  product_id: string,
  quantity: number,
  subscription: "monthly" | "yearly"
): Promise<void> {
  const customer: string = await stripe.need_customer_id();

  const coupon = "online-discount";

  const prices = await stripe.call_stripe_api("prices", "list", {
    product: product_id,
    type: "recurring",
    active: true,
  });
  let price: any = undefined;
  for (const x of prices.data) {
    if (subscription.startsWith(x.recurring?.interval)) {
      price = x;
      break;
    }
  }
  if (price == null) {
    // NOTE -- or we could create it?
    throw Error(
      `price for subscription missing -- product_id="${product_id}", subscription="${subscription}"`
    );
  }

  // TODO: will need to improve to handle case of *multiple* items on one subscription
  const options: any = {
    customer,
    items: [{ price, quantity }],
    quantity,
    coupon,
  };

  const tax_percent = await stripe.sales_tax(customer);
  if (tax_percent) {
    // CRITICAL: if we don't just multiply by 100, since then sometimes
    // stripe comes back with an error like this
    //    "Error: Invalid decimal: 8.799999999999999; must contain at maximum two decimal places."
    // TODO: tax_percent is DEPRECATED -- https://stripe.com/docs/billing/migration/taxes
    // but fortunately it still works so we can rewrite this later.
    options.tax_percent = Math.round(tax_percent * 100 * 100) / 100;
  }

  await stripe.call_stripe_api("subscriptions", "create", options);
  await stripe.update_database();
}
