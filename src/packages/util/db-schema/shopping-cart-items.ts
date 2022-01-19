/*
Table of shopping activity.

with columns:

how to use:
query for everything with bought and cancelled both null for a given user is exactly their shopping cart
query for everything for account with bought set is everything they have bought and when.
query for everything for account with cancelled if everything they decided not to buy.

*/

import { Table } from "./types";
import { Quota } from "./site-licenses";

export type ProductType = "site-license";
export type ProductDescription = Quota; // just for now.

interface PurchaseInfo {
  // maybe a stripe invoice id or a new database record?
}

export interface Item {
  id: number;
  account_id: string;
  added: Date;
  checked?: boolean;
  purchased?: PurchaseInfo;
  removed?: Date;
  product: ProductType;
  description: ProductDescription;
}

Table({
  name: "shopping_cart_items",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this item.",
      pg_type: "SERIAL UNIQUE",
    },
    account_id: {
      type: "uuid",
      desc: "account_id of the user whose shopping cart this item is being placed into.",
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
    },
    product: {
      type: "string",
      desc: "General class of product, e.g., 'site-license'.",
    },
    description: {
      type: "map",
      desc: "Object that describes the product that was placed in the shopping cart.",
    },
  },

  rules: {
    desc: "Shopping Cart Items",
    primary_key: "id",
  },
});
