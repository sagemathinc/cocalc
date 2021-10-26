/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This provides information about resource usage of a specific file in a project.
It is similar to "projet-status", in a way, because it also listens on the
general project process information generated in a project, but condenses
this for a specific path. The first example use is a specific jupyter notebook.
This will end up in the notebook interface as an indicator to show %CPU and MEM.
*/

import { Table } from "./types";

Table({
  name: "usage_info",
  fields: {
    project_id: {
      type: "uuid",
      desc: "The project id.",
    },
    path: {
      type: "string",
      desc: "the relative path to the file",
    },
    usage: {
      type: "map",
      pg_type: "JSONB[]",
      desc: "Usage information, for cpu, mem, etc.",
    },
  },
  rules: {
    durability: "ephemeral", // won't be stored in the database at all ever.
    desc:
      "Resource usage information for processes associated with a specific file (e.g. jupyter notbeook)",
    primary_key: ["project_id", "path"],
    user_query: {
      get: {
        pg_where: ["projects"],
        fields: {
          project_id: null,
          path: null,
          usage: null,
        },
      },
      set: {
        // users can set that they are interested in this
        fields: {
          project_id: "project_id",
          path: true,
        },
      },
    },

    project_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        fields: {
          project_id: null,
          path: null,
          usage: null,
        },
      },
      set: {
        // delete=true, since project *IS* allowed to delete entries
        delete: true,
        fields: {
          project_id: "project_id",
          path: true,
          usage: true,
        },
      },
    },
  },
});
