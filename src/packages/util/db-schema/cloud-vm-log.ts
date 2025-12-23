/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_vm_log",
  fields: {
    id: {
      type: "uuid",
      desc: "Unique id for this log entry.",
    },
    vm_id: {
      type: "string",
      desc: "Stable VM identifier used across providers.",
    },
    ts: {
      type: "timestamp",
      desc: "When the event was recorded.",
    },
    action: {
      type: "string",
      desc: "Lifecycle action (create/start/stop/delete/resize/status).",
    },
    status: {
      type: "string",
      desc: "Result status of the action.",
    },
    provider: {
      type: "string",
      desc: "Cloud provider (gcp, hyperstack, local, ...).",
    },
    spec: {
      type: "map",
      desc: "HostSpec at the time of the action.",
    },
    runtime: {
      type: "map",
      desc: "Runtime metadata returned by the provider.",
    },
    pricing_version: {
      type: "string",
      desc: "Pricing model version used for any estimates.",
    },
    error: {
      type: "string",
      desc: "Error details if the action failed.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["vm_id", "ts", "provider"],
    durability: "soft",
  },
});
