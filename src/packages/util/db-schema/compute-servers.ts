/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "compute_servers",
  rules: {
    primary_key: "host",
  },
  fields: {
    host: {
      type: "string",
      pg_type: "VARCHAR(63)",
    },
    dc: {
      type: "string",
    },
    port: {
      type: "integer",
    },
    secret: {
      type: "string",
    },
    experimental: {
      type: "boolean",
    },
    member_host: {
      type: "boolean",
    },
    status: {
      type: "map",
      desc: "something like {stuff:?,...,timestamp:?}",
      date: ["timestamp"],
    },
  },
});
