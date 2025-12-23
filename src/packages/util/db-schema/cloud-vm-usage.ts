/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_vm_usage",
  fields: {
    id: {
      type: "uuid",
      desc: "Unique id for this usage record.",
    },
    vm_id: {
      type: "string",
      desc: "Stable VM identifier used across providers.",
    },
    ts: {
      type: "timestamp",
      desc: "Timestamp for this usage record.",
    },
    cpu_hours: {
      type: "number",
      desc: "CPU hours consumed in the interval.",
    },
    storage_gb_hours: {
      type: "number",
      desc: "Storage GB-hours in the interval (aggregate).",
    },
    storage_class: {
      type: "string",
      desc: "Storage class/type for this usage record (e.g., pd-ssd, pd-balanced).",
    },
    storage_region: {
      type: "string",
      desc: "Region/zone where storage usage is billed.",
    },
    egress_gb: {
      type: "number",
      desc: "Network egress in GB for the interval (aggregate).",
    },
    egress_class: {
      type: "string",
      desc: "Egress class/destination (e.g., internet, same-region, inter-region).",
    },
    egress_region: {
      type: "string",
      desc: "Region where egress was billed (if applicable).",
    },
    source: {
      type: "string",
      desc: "Source of usage data (provider/api/estimate).",
    },
    confidence: {
      type: "string",
      desc: "Confidence level for this record (estimated, reconciled, etc.).",
    },
    metadata: {
      type: "map",
      desc: "Additional provider-specific usage metadata.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["vm_id", "ts"],
    durability: "soft",
  },
});
