/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COSTS, PurchaseInfo } from "smc-webapp/site-licenses/purchase/util";
import { StripeClient } from "../../stripe/client";
import { describe_quota } from "smc-util/db-schema/site-licenses";
import Stripe from "stripe";

export type Purchase = { type: "invoice" | "subscription"; id: string };

export async function charge_user_for_license(
  stripe: StripeClient,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<Purchase> {
  dbg("getting product_id");
  const product_id = await stripe_get_product(stripe, info);
  dbg("got product_id", product_id);
  if (info.subscription == "no") {
    return await stripe_purchase_product(stripe, product_id, info, dbg);
  } else {
    return await stripe_create_subscription(stripe, product_id, info, dbg);
  }
}

function get_days(info): number {
  if (info.start == null || info.end == null) throw Error("bug");
  return Math.round(
    (info.end.valueOf() - info.start.valueOf()) / (24 * 60 * 60 * 1000)
  );
}

// When we change pricing, the products in stripe will already
// exist with old prices (often grandfathered) so we may want to
// instead change the version so new products get created
// automatically.
const VERSION = 0;

function get_product_id(info: PurchaseInfo): string {
  /* We generate a unique identifier that represents the parameters of the purchase.
     The following parameters determine what "product" they are purchasing:
        - custom_always_running
        - custom_cpu
        - custom_dedicated_cpu
        - custom_disk
        - custom_member
        - custom_ram
        - custom_dedicated_ram
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
  }c${info.custom_cpu}d${info.custom_disk}m${
    info.custom_member ? 1 : 0
  }p${period}r${info.custom_ram}${
    info.custom_dedicated_ram ? "y" + info.custom_dedicated_ram : ""
  }${
    info.custom_dedicated_cpu
      ? "z" + Math.round(10 * info.custom_dedicated_cpu)
      : ""
  }_v${VERSION}`;
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
  let desc = describe_quota({
    user: info.user,
    ram: info.custom_ram,
    cpu: info.custom_cpu,
    dedicated_ram: info.custom_dedicated_ram,
    dedicated_cpu: info.custom_dedicated_cpu,
    disk: info.custom_disk,
    member: info.custom_member,
    always_running: info.always_running,
  });
  desc += " - " + period;
  return desc;
}

function get_product_metadata(info): object {
  return {
    user: info.user,
    ram: info.custom_ram,
    cpu: info.custom_cpu,
    dedicated_ram: info.custom_dedicated_ram,
    dedicated_cpu: info.custom_dedicated_cpu,
    disk: info.custom_disk,
    always_running: info.custom_always_running,
    member: info.custom_member,
    subscription: info.subscription,
    start: info.start?.toISOString(),
    end: info.end?.toISOString(),
  };
}

async function stripe_create_price(
  stripe: StripeClient,
  info: PurchaseInfo
): Promise<void> {
  const product = get_product_id(info);
  // Add the pricing info:
  //  - if sub then we set the price for monthly and yearly
  //    and build in the 25% discount since subscriptions are
  //    self-service by default.
  //  - if number of days, we set price for that many days.
  if (info.cost == null) throw Error("cost must be defined");
  if (info.subscription == "no") {
    // create the one-time cost
    await stripe.conn.prices.create({
      currency: "usd",
      unit_amount: Math.round((info.cost.cost / info.quantity) * 100),
      product,
    });
  } else {
    // create the two recurring subscription costs. Build
    // in the self-service discount, which is:
    //    COSTS.online_discount
    await stripe.conn.prices.create({
      currency: "usd",
      unit_amount: Math.round(
        COSTS.online_discount * info.cost.cost_sub_month * 100
      ),
      product,
      recurring: { interval: "month" },
    });
    await stripe.conn.prices.create({
      currency: "usd",
      unit_amount: Math.round(
        COSTS.online_discount * info.cost.cost_sub_year * 100
      ),
      product,
      recurring: { interval: "year" },
    });
  }
}

async function stripe_get_product(
  stripe: StripeClient,
  info: PurchaseInfo
): Promise<string> {
  const product_id = get_product_id(info);
  // check to see if the product has already been created; if not, create it.
  if (!(await stripe_product_exists(stripe, product_id))) {
    // now we have to create the product.
    const metadata = get_product_metadata(info) as any; // avoid dealing with TS typings for metadata for now.
    const name = get_product_name(info);
    let statement_descriptor = "COCALC LICENSE ";
    if (info.subscription != "no") {
      statement_descriptor += "SUB";
    } else {
      const n = get_days(info);
      // n<100 logic to fit in 22 characters
      statement_descriptor += `${n}${n < 100 ? " " : ""}DAYS`;
    }
    await stripe.conn.products.create({
      id: product_id,
      name,
      metadata,
      statement_descriptor,
    });
    stripe_create_price(stripe, info);
  }
  return product_id;
}

async function stripe_product_exists(
  stripe: StripeClient,
  product_id: string
): Promise<boolean> {
  try {
    await stripe.conn.products.retrieve(product_id);
    return true;
  } catch (_) {
    return false;
  }
}

async function stripe_purchase_product(
  stripe: StripeClient,
  product_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<Purchase> {
  const { quantity } = info;
  dbg("stripe_purchase_product", product_id, quantity);
  const customer: string = await stripe.need_customer_id();

  const coupon = await get_self_service_discount_coupon(stripe.conn);

  dbg("stripe_purchase_product: get price");
  const prices = await stripe.conn.prices.list({
    product: product_id,
    type: "one_time",
    active: true,
  });
  let price: string | undefined = prices.data[0]?.id;
  if (price == null) {
    dbg("stripe_purchase_product: missing -- try to create it");
    await stripe_create_price(stripe, info);
    const prices = await stripe.conn.prices.list({
      product: product_id,
      type: "one_time",
      active: true,
    });
    price = prices.data[0]?.id;
    if (price == null) {
      dbg("stripe_purchase_product: still missing -- give up");
      throw Error(
        `price for one-time purchase missing -- product_id="${product_id}"`
      );
    }
  }
  dbg("stripe_purchase_product: got price", JSON.stringify(price));

  if (info.start == null || info.end == null) {
    throw Error("start and end must be defined");
  }
  const period = {
    start: Math.round(info.start.valueOf() / 1000),
    end: Math.round(info.end.valueOf() / 1000),
  };

  // gets automatically put on the invoice created below.
  await stripe.conn.invoiceItems.create({ customer, price, quantity, period });

  // TODO: improve later to handle case of *multiple* items on one invoice

  // TODO: tax_percent is DEPRECATED (see stripe_create_subscription below).
  const tax_percent = await stripe.sales_tax(customer);
  const options: Stripe.InvoiceCreateParams = {
    customer,
    auto_advance: true,
    collection_method: "charge_automatically",
    tax_percent: tax_percent
      ? Math.round(tax_percent * 100 * 100) / 100
      : undefined,
  } as const;

  dbg("stripe_purchase_product options=", JSON.stringify(options));
  await stripe.conn.customers.update(customer, { coupon });
  const invoice_id = (await stripe.conn.invoices.create(options)).id;
  await stripe.conn.invoices.finalizeInvoice(invoice_id, {
    auto_advance: true,
  });
  const invoice = await stripe.conn.invoices.pay(invoice_id, {
    payment_method: info.payment_method,
  });
  // remove coupon so it isn't automatically applied
  await stripe.conn.customers.deleteDiscount(customer);
  await stripe.update_database();
  if (!invoice.paid) {
    // We void it so user doesn't get charged later.  Of course,
    // we plan to rewrite this to keep trying and once they pay it
    // somehow, then they get their license.  But that's a TODO!
    await stripe.conn.invoices.voidInvoice(invoice_id);
    throw Error(
      "created invoice but not able to pay it -- invoice has been voided; please try again when you have a valid payment method on file"
    );
  }
  return { type: "invoice", id: invoice_id };
}

async function stripe_create_subscription(
  stripe: StripeClient,
  product_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<Purchase> {
  const { quantity, subscription } = info;
  const customer: string = await stripe.need_customer_id();

  const prices = await stripe.conn.prices.list({
    product: product_id,
    type: "recurring",
    active: true,
  });
  let price: string | undefined = undefined;
  for (const x of prices.data) {
    if (subscription.startsWith(x.recurring?.interval ?? "none")) {
      price = x?.id;
      break;
    }
  }
  if (price == null) {
    await stripe_create_price(stripe, info);
    const prices = await stripe.conn.prices.list({
      product: product_id,
      type: "recurring",
      active: true,
    });
    for (const x of prices.data) {
      if (subscription.startsWith(x.recurring?.interval ?? "none")) {
        price = x?.id;
        break;
      }
    }
    if (price == null) {
      dbg("stripe_purchase_product: still missing -- give up");
      throw Error(
        `price for subscription purchase missing -- product_id="${product_id}", subscription="${subscription}"`
      );
    }
  }

  // TODO: will need to improve to handle case of *multiple* items on one subscription

  // CRITICAL: if we don't just multiply by 100, since then sometimes
  // stripe comes back with an error like this
  //    "Error: Invalid decimal: 8.799999999999999; must contain at maximum two decimal places."
  // TODO: tax_percent is DEPRECATED -- https://stripe.com/docs/billing/migration/taxes
  // but fortunately it still works so we can rewrite this later.
  const tax_percent = await stripe.sales_tax(customer);

  const options = {
    customer,
    items: [{ price, quantity }],
    tax_percent: tax_percent
      ? Math.round(tax_percent * 100 * 100) / 100
      : undefined,
  };

  const { id } = await stripe.conn.subscriptions.create(options);
  await stripe.update_database();
  return { type: "subscription", id };
}

// Gets a coupon that matches the current online discount.
const known_coupons: { [coupon_id: string]: boolean } = {};
async function get_self_service_discount_coupon(conn: Stripe): Promise<string> {
  const percent_off = Math.round(100 * (1 - COSTS.online_discount));
  const id = `coupon_self_service_${percent_off}`;
  if (known_coupons[id]) {
    return id;
  }
  try {
    await conn.coupons.retrieve(id);
  } catch (_) {
    // coupon doesn't exist, so we have to create it.
    await conn.coupons.create({
      id,
      percent_off,
      name: "Self-service discount",
      duration: "forever",
    });
  }
  known_coupons[id] = true;
  return id;
}

export async function set_purchase_metadata(
  stripe: StripeClient,
  purchase: Purchase,
  metadata
): Promise<void> {
  if (purchase.type == "subscription") {
    stripe.conn.subscriptions.update(purchase.id, { metadata });
  } else if (purchase.type == "invoice") {
    stripe.conn.invoices.update(purchase.id, { metadata });
  }
}
