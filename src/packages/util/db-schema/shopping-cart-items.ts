/*
Table of shopping activity.

with columns:

how to use:
query for everything with bought and canceled both null for a given user is exactly their shopping cart
query for everything for account with bought set is everything they have bought and when.
query for everything for account with canceled if everything they decided not to buy.

*/

import { Table } from "./types";
import { SCHEMA as schema } from "./index";
import { SiteLicenseDescriptionDB } from "../upgrades/shopping";

export type ProductType = "site-license" | "cash-voucher";

export interface CashVoucher {
  type: "cash-voucher";
  amount: number;
  numVouchers: number;
  whenPay: "now" | "admin";
  length: number;
  title: string;
  prefix: string;
  postfix: string;
  charset: string;
  expire: Date;
}

export type ProductDescription = SiteLicenseDescriptionDB | CashVoucher;

export interface Item {
  id: number;
  account_id: string;
  added: Date;
  checked?: boolean;
  purchased?: {
    // if item has been bought and paid for and allocated
    success?: true;
    // when it was bought and paid for
    time?: Date;
    // if allocated this is the license that was created
    license_id?: string;
    // voucher if that was what was bought (instead of a license)
    voucher_id?: number;
    // when checkout happened, which should trigger payment
    checkout_time?: Date;
    // if paying money, the payment intent
    payment_intent?: string;
  };
  removed?: Date;
  product: ProductType;
  description: ProductDescription;
  project_id?: string;
}

Table({
  name: "shopping_cart_items",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this item.",
      pg_type: "SERIAL UNIQUE",
      noCoerce: true,
    },
    account_id: {
      type: "uuid",
      desc: "account_id of the user whose shopping cart this item is being placed into.",
      title: "Account",
      render: { type: "account" },
    },
    added: {
      type: "timestamp",
      desc: "When this item was added to account_id's shopping cart.",
    },
    checked: {
      type: "boolean",
      desc: "Whether or not this item is selected for inclusion during checkout.",
    },
    removed: {
      type: "timestamp",
      desc: "Date when this item was removed from account_id's shopping cart.",
    },
    purchased: {
      type: "map",
      desc: "Object that describes the purchase once it is made.  account_id of who made the purchase?  Pointer to stripe invoice?  license_id.",
      render: { type: "purchased" },
    },
    product: {
      type: "string",
      desc: "General class of product, e.g., 'site-license', 'cash-voucher'.",
    },
    description: {
      type: "map",
      desc: "Object that describes the product that was placed in the shopping cart.",
      render: { type: "json" },
    },
    project_id: {
      type: "string",
      desc: "optionally, upon adding a license to the cart, we save the projrect_id for which this license is purchased for.",
    },
  },

  rules: {
    desc: "Shopping Cart Items",
    primary_key: "id",
  },
});

Table({
  name: "crm_shopping_cart_items",
  rules: {
    virtual: "shopping_cart_items",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true, // only admins can do get queries on this table; not set queries at all by anybody -- that is done via an api.
        fields: {
          id: null,
          account_id: null,
          added: null,
          checked: null,
          removed: null,
          purchased: null,
          product: null,
          description: null,
          project_id: null,
        },
        options: [{ limit: 100 }],
      },
    },
  },
  fields: schema.shopping_cart_items.fields,
});
