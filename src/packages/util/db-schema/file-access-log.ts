/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "file_access_log",
  rules: {
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for analytics
    pg_indexes: ["project_id", "account_id", "filename", "time"],
    user_query: {
      get: {
        admin: true,
        fields: {
          id: null,
          project_id: null,
          account_id: null,
          filename: null,
          time: null,
        },
      },
    },
  },
  fields: {
    id: {
      type: "uuid",
    },
    project_id: {
      type: "uuid",
      render: { type: "project_link" },
    },
    account_id: {
      type: "uuid",
      render: { type: "account" },
    },
    filename: {
      type: "string",
    },
    time: {
      type: "timestamp",
    },
  },
});
