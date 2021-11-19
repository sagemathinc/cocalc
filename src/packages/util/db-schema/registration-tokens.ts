/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// An account token is a piece of additional information,
// which might be necessary to create an account.
// In the future, this might be extended to dispatch some action,
// like adding a student to a course, similar to account creation actions.

import {
  Table,
  RegistrationTokenSetFields,
  RegistrationTokenGetFields,
} from "./types";

// this covers 3 cases: selecting all, updating one, and deleting one
async function instead_of_query(db, opts: any, cb: Function): Promise<void> {
  const { options, query } = opts;
  try {
    cb(undefined, await db.registrationTokens(options, query));
  } catch (err) {
    cb(err);
  }
}

Table({
  name: "registration_tokens",
  rules: {
    primary_key: "token",
    anonymous: false,
    user_query: {
      set: {
        admin: true,
        instead_of_query,
        delete: true,
        fields: {
          token: null,
          descr: null,
          expires: null,
          limit: null,
          disabled: null,
        } as { [key in RegistrationTokenSetFields]: null },
      },
      get: {
        admin: true,
        instead_of_query,
        pg_where: [], // no limits
        fields: {
          token: null,
          descr: null,
          expires: null,
          counter: null,
          limit: null,
          disabled: null,
        } as { [key in RegistrationTokenGetFields]: null },
      },
    },
  },
  fields: {
    token: { type: "string" },
    descr: { type: "string" },
    counter: { type: "number", desc: "how many accounts are created" },
    expires: {
      type: "timestamp",
      desc: "optional – the time, when this token is no longer valid",
    },
    limit: { type: "number", desc: "optional – maximum number of accounts" },
    disabled: { type: "boolean", desc: "set to true to disable this token" },
  },
});
