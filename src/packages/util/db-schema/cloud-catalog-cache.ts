/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_catalog_cache",
  fields: {
    id: {
      type: "string",
      desc: "Composite key: provider/kind/scope.",
    },
    provider: {
      type: "string",
      desc: "Cloud provider (gcp, hyperstack, ...).",
    },
    kind: {
      type: "string",
      desc: "Catalog kind (regions, zones, machine_types, gpu_types, ...).",
    },
    scope: {
      type: "string",
      desc: "Optional scope (global, region/<name>, zone/<name>).",
    },
    payload: {
      type: "map",
      desc: "Catalog payload as JSON.",
    },
    fetched_at: {
      type: "timestamp",
      desc: "When this payload was fetched.",
    },
    ttl_seconds: {
      type: "integer",
      desc: "How long this payload is considered fresh.",
    },
    etag: {
      type: "string",
      desc: "Optional provider etag/version for refresh.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["provider", "kind", "scope", "fetched_at"],
    durability: "soft",
  },
});
