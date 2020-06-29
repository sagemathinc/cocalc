/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// An account token is a piece of additional information,
// which might be necessary to create an account.
// In the future, this might be extended to dispatch some action,
// like adding a student to a course, similar to account creation actions.

import { Table } from "./types";

Table({
  name: "account_tokens",
  rules: {
    primary_key: "token",
    anonymous: false,
    user_query: {
      set: {
        admin: true,
        fields: {
          token: null,
          desc: null,
          expires: null,
          limit: null,
          disabled: null,
        },
      },
      get: {
        fields: {
          admin: true,
          fields: {
            token: null,
            desc: null,
            expires: null,
            counter: null,
            limit: null,
            disabled: null,
          },
        },
      },
    },
  },
  fields: {
    token: { type: "string" },
    desc: { type: "string" },
    counter: { type: "number", desc: "how many accounts are created" },
    expires: {
      type: "timestamp",
      desc: "optional – the time, when this token is no longer valid",
    },
    limit: { type: "number", desc: "optional – maximum number of accounts" },
    disabled: { type: "boolean", desc: "set to true to disable this token" },
  },
});
