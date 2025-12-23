/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_pricing_cache",
  fields: {
    provider: {
      type: "string",
      desc: "Cloud provider (gcp, hyperstack, ...).",
    },
    sku: {
      type: "string",
      desc: "Provider SKU or pricing key.",
    },
    region: {
      type: "string",
      desc: "Region where pricing applies.",
    },
    unit_price: {
      type: "integer",
      desc: "Price per unit in USD pennies (100 = $1.00).",
    },
    fetched_at: {
      type: "timestamp",
      desc: "When this price was fetched.",
    },
    ttl_seconds: {
      type: "number",
      desc: "How long this price can be cached.",
    },
    pricing_version: {
      type: "string",
      desc: "Pricing model/version for auditability.",
    },
    metadata: {
      type: "map",
      desc: "Provider-specific fields.",
    },
  },
  rules: {
    primary_key: "sku",
    pg_indexes: ["provider", "region", "fetched_at"],
    durability: "soft",
  },
});
