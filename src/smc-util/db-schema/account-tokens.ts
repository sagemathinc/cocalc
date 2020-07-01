/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// An account token is a piece of additional information,
// which might be necessary to create an account.
// In the future, this might be extended to dispatch some action,
// like adding a student to a course, similar to account creation actions.

import { Table } from "./types";
import { PostgreSQL } from "../../smc-hub/postgres/types";
import { callback2 as cb2 } from "../../smc-util/async-utils";

async function instead_of_query(
  db: PostgreSQL,
  opts: any,
  cb: Function
): Promise<void> {
  const { options, query } = opts;
  console.log("query", query, "options", options);
  if (query.token == "*") {
    const data = await cb2(db._query, {
      query: "SELECT * FROM account_tokens",
    });
    cb(null, data.rows);
  } else if (query.token != null && query.token != "") {
    const { token, desc, expires, limit, disabled } = query;
    await cb2(db._query, {
      query: `INSERT INTO account_tokens ("token","desc","expires","limit","disabled") 
              VALUES ($, $, $, $, $) ON CONFLICT (token)
              DO UPDATE SET (token,desc,expires,limit,disabled) = (EXCLUDED.token,EXCLUDED.desc,EXCLUDED.expires,EXCLUDED.limit,EXCLUDED.disabled)`,
      params: [
        token,
        desc ? desc : "NULL",
        expires ? expires : "NULL",
        limit >= 0 ? limit : "NULL",
        disabled != null ? disabled : false,
      ],
    });
  } else {
    throw new Error("don't know what to do with this query");
  }
}

Table({
  name: "account_tokens",
  rules: {
    primary_key: "token",
    anonymous: false,
    user_query: {
      validate: false,
      set: {
        admin: true,
        instead_of_query,
        delete: true,
        fields: {
          token: null,
          desc: null,
          expires: null,
          limit: null,
          disabled: null,
        },
      },
      get: {
        admin: true,
        instead_of_query,
        pg_where: [], // no limits
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
