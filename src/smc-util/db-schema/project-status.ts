/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This table contains the current overall status about a running project.
This is the sister-table to "project-status".
In contrast, this table provides much less frequently changed pieces of statusrmation.
For example, project version, certain "alerts", disk usage, etc.
Its intended usage is to subscribe to it once you open a project and notify the user if certain alerts go off.
*/

import { Table } from "./types";

Table({
  name: "project_status",
  fields: {
    project_id: {
      type: "uuid",
      desc: "The project id.",
    },
    status: {
      // change this according to all the usual schema rules
      type: "map",
      pg_type: "JSONB[]",
      desc: "Status of this project",
    },
  },
  rules: {
    durability: "ephemeral", // won't be stored in the database at all ever.
    desc:
      "Project status, like version, certain 'alerts', disk usage, ...",
    primary_key: ["project_id"], // can list multiple another field if you want to have multiple records for a project.
    user_query: {
      get: {
        pg_where: ["projects"],
        fields: {
          project_id: null,
          status: null,
        },
      },
      set: {
        // users can set that they are interested in this
        fields: {
          project_id: "project_id",
          status: true,
        },
      },
    },

    project_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        fields: {
          project_id: null,
          status: null,
        },
      },
      set: {
        // delete=true, since project *IS* allowed to delete entries
        delete: true,
        fields: {
          project_id: "project_id",
          status: true,
        },
      },
    },
  },
});
