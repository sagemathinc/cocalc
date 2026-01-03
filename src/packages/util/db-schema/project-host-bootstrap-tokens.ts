/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "project_host_bootstrap_tokens",
  rules: {
    primary_key: "token_id",
    pg_indexes: ["host_id", "expires", "created"],
  },
  fields: {
    token_id: {
      type: "uuid",
      desc: "Public token id portion of the bootstrap token.",
    },
    host_id: {
      type: "uuid",
      desc: "Project host id for this token.",
    },
    token_hash: {
      type: "string",
      desc: "Hash of the secret portion of the bootstrap token.",
    },
    purpose: {
      type: "string",
      pg_type: "varchar(64)",
      desc: "Purpose for this token (e.g., bootstrap).",
    },
    created: {
      type: "timestamp",
      desc: "When this token was created.",
    },
    expires: {
      type: "timestamp",
      desc: "When this token expires.",
    },
    last_used: {
      type: "timestamp",
      desc: "When this token was last used.",
    },
    revoked: {
      type: "boolean",
      desc: "True if this token has been revoked.",
    },
  },
});
