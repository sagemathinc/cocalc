/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "buckets",
  rules: {
    primary_key: "id",
    pg_indexes: ["provider", "purpose", "region", "name"],
    pg_unique_indexes: ["name"],
  },
  fields: {
    id: {
      type: "uuid",
      desc: "Bucket id (internal identifier).",
    },
    provider: {
      type: "string",
      desc: "Storage provider, e.g., r2.",
    },
    purpose: {
      type: "string",
      desc: "Purpose for this bucket, e.g., project-backups.",
    },
    region: {
      type: "string",
      desc: "Requested region hint (e.g., wnam/apac).",
    },
    location: {
      type: "string",
      desc: "Provider-reported bucket location, if known.",
    },
    name: {
      type: "string",
      desc: "Bucket name in the provider.",
    },
    account_id: {
      type: "string",
      desc: "Provider account id owning this bucket.",
    },
    access_key_id: {
      type: "string",
      desc: "Access key id for this bucket.",
    },
    secret_access_key: {
      type: "string",
      desc: "Secret access key for this bucket.",
    },
    endpoint: {
      type: "string",
      desc: "Endpoint URL for accessing this bucket.",
    },
    status: {
      type: "string",
      desc: "Bucket status (active/mismatch/unknown/disabled).",
    },
    created: {
      type: "timestamp",
      desc: "When this bucket record was created.",
    },
    updated: {
      type: "timestamp",
      desc: "When this bucket record was last updated.",
    },
  },
});
