/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Table of information about a running project.
*/

import { Table } from "./types";

export const WATCH_TIMEOUT_MS = 60000;

Table({
  name: "project_info",
  fields: {
    project_id: {
      type: "uuid",
      desc: "The project id.",
    },
    info: {
      // change this according to all the usual schema rules
      type: "map",
      pg_type: "JSONB[]",
      desc: "Info about the project",
    },
  },
  rules: {
    durability: "ephemeral", // won't be stored in the database at all ever.
    desc:
      "Information about running processes (disk space, etc.,?) of projects",
    primary_key: ["project_id"], // can list multiple another field if you want to have multiple records for a project.
    user_query: {
      get: {
        pg_where: ["projects"],
        fields: {
          project_id: null,
          info: null,
        },
      },
      set: {
        // users can set that they are interested in this directory and also
        // remove paths from the list of deleted paths (e.g., in case they want
        // to edit afile that was deleted).
        fields: {
          project_id: "project_id",
          info: true,
        },
      },
    },

    project_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        fields: {
          project_id: null,
          info: null,
        },
      },
      set: {
        // delete=true, since project *IS* allowed to delete entries
        // in this table (used for purging tracked listings).
        delete: true,
        fields: {
          project_id: "project_id",
          info: true,
        },
      },
    },
  },
});
