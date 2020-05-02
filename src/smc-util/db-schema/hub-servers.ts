/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "hub_servers",
  rules: {
    primary_key: "host",
    durability: "soft", // loss of some log data not serious, since ephemeral and expires quickly anyways
  },
  fields: {
    host: {
      type: "string",
      pg_type: "VARCHAR(63)",
    },
    port: {
      type: "integer",
    },
    clients: {
      type: "integer",
    },
    expire: {
      type: "timestamp",
    },
  },
});
