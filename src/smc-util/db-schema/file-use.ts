/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

import { minutes_ago } from "../misc";

/* TODO: for postgres rewrite after done we MIGHT completely redo file_use to eliminate
the id field, use project_id, path as a compound primary key, and maybe put users in
another table with a relation.  There is also expert discussion about this table in the
Hacker News discussion of my PostgreSQL vs ... blog post.
*/

Table({
  name: "file_use",
  fields: {
    id: {
      type: "string",
      pg_type: "CHAR(40)",
    },
    project_id: {
      type: "uuid",
    },
    path: {
      type: "string",
    },
    users: {
      type: "map",
      desc:
        "{account_id1: {action1: timestamp1, action2:timestamp2}, account_id2: {...}}",
      date: "all",
    },
    last_edited: {
      type: "timestamp",
    },
  },
  rules: {
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for showing notifications
    unique_writes: true, // there is no reason for a user to write the same record twice
    db_standby: "safer", // allow doing the initial read part of the query from a standby node.
    pg_indexes: ["project_id", "last_edited"],

    // CRITICAL!  At scale, this query
    //    SELECT * FROM file_use WHERE project_id = any(select project_id from projects where users ? '25e2cae4-05c7-4c28-ae22-1e6d3d2e8bb3') ORDER BY last_edited DESC limit 100;
    // will take forever due to the query planner being off with its estimation (its the case where there is no such user or no data) and also uses several workers to do an index scan
    // We disable the indes scan for this query, which gets rid of the extra workers and runs fine.
    pg_indexscan: false,

    // lower priority – if it fails, client should retry later
    priority: 7,

    // I put a time limit in pg_where below of to just give genuinely recent notifications,
    // and massively reduce server load.  The obvious todo list is to make another file_use
    // virtual table that lets you get older entries.
    user_query: {
      get: {
        pg_where: ["last_edited >= NOW() - interval '21 days'", "projects"],
        pg_where_load: [
          "last_edited >= NOW() - interval '10 days'",
          "projects",
        ],
        pg_changefeed: "projects",
        options: [{ order_by: "-last_edited" }, { limit: 200 }], // limit is arbitrary
        options_load: [{ order_by: "-last_edited" }, { limit: 70 }], // limit is arbitrary
        throttle_changes: 3000,
        fields: {
          id: null,
          project_id: null,
          path: null,
          users: null,
          last_edited: null,
        },
      },
      set: {
        fields: {
          id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          project_id: "project_write",
          path: true,
          users: true,
          last_edited: true,
        },
        required_fields: {
          id: true,
          project_id: true,
          path: true,
        },
        check_hook(db, obj, account_id, _project_id, cb) {
          // hook to note that project is being used (CRITICAL: do not pass path
          // into db.touch since that would cause another write to the file_use table!)
          // CRITICAL: Only do this if what edit or chat for this user is very recent.
          // Otherwise we touch the project just for seeing notifications or opening
          // the file, which is confusing and wastes a lot of resources.
          const x = obj.users != null ? obj.users[account_id] : undefined;
          const recent = minutes_ago(3);
          if (
            x != null &&
            (x.edit >= recent || x.chat >= recent || x.open >= recent)
          ) {
            db.touch({ project_id: obj.project_id, account_id });
            // Also log that this particular file is being used/accessed; this
            // is mainly only for longterm analytics but also the file_use_times
            // virtual table queries this.  Note that log_file_access
            // is throttled.
            db.log_file_access({
              project_id: obj.project_id,
              account_id,
              filename: obj.path,
            });
          }
          cb();
        },
      },
    },
  },
});
