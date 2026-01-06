/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "self_host_connector_tokens",
  rules: {
    primary_key: "token_id",
    pg_indexes: [
      "account_id",
      "connector_id",
      "host_id",
      "expires",
      "created",
    ],
  },
  fields: {
    token_id: {
      type: "uuid",
      desc: "Public token id portion of the pairing token.",
    },
    account_id: {
      type: "uuid",
      desc: "Owner account for this pairing token.",
    },
    connector_id: {
      type: "uuid",
      desc: "Connector id this token is scoped to (if any).",
    },
    host_id: {
      type: "uuid",
      desc: "Project host id this token is scoped to (if any).",
    },
    token_hash: {
      type: "string",
      desc: "Hash of the secret portion of the token.",
    },
    purpose: {
      type: "string",
      pg_type: "varchar(64)",
      desc: "Purpose for this token (e.g., pairing).",
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
