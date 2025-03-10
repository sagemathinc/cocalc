/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";
import { SCHEMA as schema } from "./index";

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
      desc: "User who this auth token grants access to become",
      type: "uuid",
      render: { type: "account" },
    },
    expire: {
      type: "timestamp",
      render: { type: "timestamp", editable: false },
    },
    created: {
      desc: "When this auth token was created",
      type: "timestamp",
      render: { type: "timestamp" },
    },
    created_by: {
      desc: "User who created the auth token.",
      type: "uuid",
      render: { type: "account" },
    },
    is_admin: {
      desc: "True if wser who created the auth token did so as an admin.",
      type: "boolean",
    },
  },
  rules: {
    primary_key: "auth_token",
  },
});

Table({
  name: "crm_auth_tokens",
  rules: {
    virtual: "auth_tokens",
    primary_key: "auth_token",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        fields: {
          account_id: null,
          expire: null,
          created: null,
          created_by: null,
          is_admin: null,
        },
      },
    },
  },
  fields: schema.auth_tokens.fields,
});
