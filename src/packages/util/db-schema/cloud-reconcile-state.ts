/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_reconcile_state",
  fields: {
    provider: {
      type: "string",
      desc: "Cloud provider name (e.g., gcp, hyperstack, lambda).",
    },
    last_run_at: {
      type: "timestamp",
      desc: "When reconciliation last ran for this provider.",
    },
    next_run_at: {
      type: "timestamp",
      desc: "When reconciliation should next run for this provider.",
    },
    last_error: {
      type: "string",
      desc: "Most recent reconcile error (if any).",
    },
    updated_at: {
      type: "timestamp",
      desc: "Last update time.",
    },
  },
  rules: {
    primary_key: "provider",
    pg_indexes: ["next_run_at"],
    durability: "soft",
  },
});
