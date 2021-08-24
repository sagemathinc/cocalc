/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "mentions",
  fields: {
    time: {
      type: "timestamp",
      desc: "when this mention happened.",
    },
    project_id: {
      type: "uuid",
    },
    path: {
      type: "string",
    },
    source: {
      type: "uuid",
      desc: "User who did the mentioning.",
    },
    target: {
      type: "string",
      desc:
        "uuid of user who was mentioned; later will have other possibilities including group names, 'all', etc.",
    },
    description: {
      type: "string",
      desc:
        "Extra text to describe the mention. eg. could be the containing message",
    },
    priority: {
      type: "number",
      desc:
        "optional integer priority.  0 = default, but could be 1 = higher priority, etc.",
    },
    error: {
      type: "string",
      desc: "some sort of error occured handling this mention",
    },
    action: {
      type: "string",
      desc: "what action was attempted by the backend - 'email', 'ignore'",
    },
    users: {
      type: "map",
      desc:
        "{account_id1: {read: boolean, saved: boolean}, account_id2: {...}}",
    },
  },
  rules: {
    primary_key: ["time", "project_id", "path", "target"],
    db_standby: "unsafe",
    pg_indexes: ["action"],
    user_query: {
      get: {
        pg_where: ["time >= NOW() - interval '14 days'", "projects"],
        pg_changefeed: "projects",
        options: [{ order_by: "-time" }, { limit: 100 }], // limit is arbitrary
        throttle_changes: 3000,
        fields: {
          time: null,
          project_id: null,
          path: null,
          source: null,
          target: null,
          priority: null,
          description: null,
          users: null,
        },
      },
      set: {
        fields: {
          time({ time }) {
            return time || new Date();
          },
          project_id: "project_write",
          path: true,
          source: true,
          target: true,
          priority: true,
          description: true,
          users: true,
        },
        required_fields: {
          project_id: true,
          source: true,
          path: true,
          target: true,
        },
      },
    },
  },
});
