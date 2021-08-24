/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { deep_copy, uuid } from "../misc";
import { SCHEMA as schema } from "./index";
import { Table } from "./types";

Table({
  name: "project_log",
  rules: {
    primary_key: "id",
    // db_standby feels too slow for this, since the user only
    // does this query when they actually click to show the log.
    //db_standby: "unsafe",
    durability: "soft", // dropping a log entry (e.g., "foo opened a file") wouldn't matter much

    pg_indexes: ["project_id", "time"],

    user_query: {
      get: {
        pg_where: ["time >= NOW() - interval '2 months'", "projects"],
        pg_changefeed: "projects",
        options: [{ order_by: "-time" }, { limit: 300 }],
        throttle_changes: 2000,
        fields: {
          id: null,
          project_id: null,
          time: null,
          account_id: null,
          event: null,
        },
      },
      set: {
        fields: {
          id(obj) {
            return obj.id != null ? obj.id : uuid();
          },
          project_id: "project_write",
          account_id: "account_id",
          time: true,
          event: true,
        },
      },
    },
  },
  fields: {
    id: {
      type: "uuid",
      desc: "which",
    },
    project_id: {
      type: "uuid",
      desc: "where",
    },
    time: {
      type: "timestamp",
      desc: "when",
    },
    account_id: {
      type: "uuid",
      desc: "who",
    },
    event: {
      type: "map",
      desc: "what",
    },
  },
});

// project_log_all -- exactly like project_log, but loads up
// to the most recent **many** log entries (so a LOT).
schema.project_log_all = deep_copy(schema.project_log);
// This happens rarely, and user is prepared to wait.
schema.project_log_all.db_standby = "unsafe";
schema.project_log_all.virtual = "project_log";
// no time constraint:
if (schema.project_log_all.user_query?.get == null) {
  throw Error("make typescript happy");
}
schema.project_log_all.user_query.get.pg_where = ["projects"];
schema.project_log_all.user_query.get.options = [
  { order_by: "-time" },
  { limit: 7500 },
];
