/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "stats",
  fields: {
    id: {
      type: "uuid",
    },
    time: {
      type: "timestamp",
      pg_check: "NOT NULL",
    },
    accounts: {
      type: "integer",
      pg_check: "NOT NULL CHECK (accounts >= 0)",
    },
    accounts_created: {
      type: "map",
    },
    files_opened: {
      type: "map",
    },
    projects: {
      type: "integer",
      pg_check: "NOT NULL CHECK (projects >= 0)",
    },
    projects_created: {
      type: "map",
    },
    projects_edited: {
      type: "map",
    },
    hub_servers: {
      type: "array",
      pg_type: "JSONB[]",
    },
    running_projects: {
      type: "map",
    },
  },
  rules: {
    primary_key: "id",
    durability: "soft", // ephemeral stats whose slight loss wouldn't matter much
    anonymous: false, // if true, this would allow user read access, even if not signed in -- we used to do this but decided to use polling instead, since update interval is predictable.
    pg_indexes: ["time"],
  },
});
