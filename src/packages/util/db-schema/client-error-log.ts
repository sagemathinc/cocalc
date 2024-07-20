/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "client_error_log",
  fields: {
    id: {
      type: "uuid",
      desc: "unique identifier for entry (randomly generated)",
    },
    event: { type: "string", desc: "arbitrary event label" },
    error: {
      type: "string",
      desc: "the actual error message user saw formatted in JSON",
      render: { type: "json-string" },
    },
    account_id: {
      type: "uuid",
      desc: "the account_id of the user",
      render: {
        type: "account",
      },
    },
    time: { type: "timestamp", desc: "when user saw the error" },
    expire: {
      type: "timestamp",
      desc: "when to delete this error automatically from the table to save space",
    },
  },
  rules: {
    desc: "Table used to log errors that clients see in their web browser.",
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for analytics
    pg_indexes: ["time", "event"],
    user_query: {
      get: {
        admin: true,
        fields: {
          id: null,
          event: null,
          error: null,
          account_id: null,
          time: null,
          expire: null,
        },
      },
    },
  },
});
