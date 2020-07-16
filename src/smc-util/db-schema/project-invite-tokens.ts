/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project invite tokens.  If a user presents one of these tokens and it is
not expired and the counter hasn't hit the usage_limit, then they get added
as a collaborator to the given project.
*/

import { Table } from "./types";

export interface ProjectInviteToken {
  token: string;
  project_id: string;
  created: Date;
  expires?: Date;
  usage_limit?: number;
  counter?: number;
}

Table({
  name: "project_invite_tokens",
  fields: {
    token: {
      type: "string",
      desc: "random unique id (intention: this is a random string)",
    },
    project_id: {
      type: "uuid",
      desc: "project_id of the project that this token provides access to",
    },
    created: {
      type: "timestamp",
      desc:
        "when this token was created (just used for user convenience so no sanity checking)",
    },
    expires: {
      type: "timestamp",
      desc: "when this token expires",
    },
    usage_limit: {
      type: "number",
      desc: "how many times this token can be used",
    },
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
        options: [{ order_by: "-created" }],
        pg_where: ["projects"],
        fields: {
          project_id: null,
          token: null,
          expires: null,
          created: null,
          usage_limit: null,
          counter: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          token: null,
          expires: null,
          created: null,
          usage_limit: null,
        },
        required_fields: {
          project_id: true,
          token: true,
        },
      },
    },
  },
});
