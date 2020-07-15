/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project invite tokens.  If a user presents one of these tokens and it is
not expired and the counter hasn't hit the limit, then they get added
as a collaborator to the given project.
*/

import { Table } from "./types";

Table({
  name: "project_invite_tokens",
  fields: {
    token: {
      type: "string",
      desc:
        "random unique id (intention: this is a 16-character random string)",
    },
    project_id: {
      type: "uuid",
      desc: "project_id of the project that this token provides access to",
    },
    expires: {
      type: "timestamp",
      desc: "when this token expires",
    },
    limit: { type: "number", desc: "how many times this token can be used" },
    counter: {
      type: "number",
      desc: "how many times this token has been used",
    },
  },
  rules: {
    primary_key: "token",
    pg_indexes: ["project_id"],
    user_query: {
      get: {
        pg_where: ["projects"],
        fields: {
          project_id: null,
          token: null,
          expires: null,
          limit: null,
          counter: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          token: null,
          expires: null,
          limit: null,
        },
        required_fields: {
          project_id: true,
          token: true,
        },
      },
    },
  },
});
