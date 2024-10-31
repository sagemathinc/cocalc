/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { BOOKMARK_TYPES } from "@cocalc/util/consts/bookmarks";

import { ID } from "./crm";
import { Table } from "./types";

// This table stores various types of bookmarks. This started with backing up starred tabs for a user in a project.
Table({
  name: "bookmarks",
  fields: {
    id: ID,
    type: {
      type: "string",
      desc: "Type of bookmark as defined in @cocalc/util/consts/bookmarks",
    },
    project_id: {
      type: "uuid",
      desc: "The Project ID where this bookmark belongs to",
    },
    account_id: {
      type: "uuid",
      desc: "(optional) if not set, this bookmark is project wide, for all collaborators",
    },
    path: {
      type: "string",
      desc: "(optional) path to a specific file in the project",
    },
    stars: {
      type: "array",
      pg_type: "TEXT[]",
      desc: " a list of strings of paths or IDs",
    },
    last_edited: {
      type: "timestamp",
      desc: "When the bookmark last changed",
    },
  },
  rules: {
    desc: "Table for various types of bookmarks.",
    primary_key: "id",
    pg_indexes: ["type", "project_id", "account_id"],
    user_query: {
      get: {
        pg_where: [
          {
            "project_id = $::UUID": "project_id",
            "account_id = $::UUID": "account_id",
          },
        ],
        fields: {
          id: null,
          type: null,
          project_id: null,
          account_id: null,
          path: null,
          stars: null,
          last_edited: null,
        },
      },
      set: {
        fields: {
          type: true,
          project_id: "project_write",
          account_id: "account_id",
          path: true,
          stars: true,
        },
        async check_hook(_db, obj, _account_id, _project_id, cb) {
          const type = obj.type;
          if (!BOOKMARK_TYPES.includes(type)) {
            cb("type '${type} is invalid");
            return;
          }
          cb();
        },
      },
    },
  },
});
