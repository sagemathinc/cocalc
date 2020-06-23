/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "remember_me",
  fields: {
    hash: {
      type: "string",
      pg_type: "CHAR(127)",
    },
    value: {
      type: "map",
    },
    account_id: {
      type: "uuid",
    },
    expire: {
      type: "timestamp",
    },
  },
  rules: {
    primary_key: "hash",
    durability: "soft", // dropping this would just require a user to login again
    pg_indexes: ["account_id"],
  },
});

Table({
  name: "auth_tokens",
  fields: {
    auth_token: {
      type: "string",
      pg_type: "CHAR(24)",
    },
    account_id: {
      type: "uuid",
    },
    expire: {
      type: "timestamp",
    },
  },
  rules: {
    primary_key: "auth_token",
  },
});
