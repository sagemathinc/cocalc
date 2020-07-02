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

function is_delete(options: Array<{ delete?: boolean }>) {
  return options.some((v) => v?.delete === true);
}

// this covers 3 cases: selecting all, updating one, and deleting one
async function instead_of_query(
  db: PostgreSQL,
  opts: any,
  cb: Function
): Promise<void> {
  const { options, query } = opts;
  try {
    if (is_delete(options) && query.token) {
      // delete if option is set and there is a token which is defined and not an empty string
      await cb2(db._query, {
        query: "DELETE FROM registration_tokens WHERE token = $1",
        params: [query.token],
      });
      cb(null);
    } else {
      // either we want to get all tokens or insert/edit one

      if (query.token == "*") {
        // select all tokens
        const data = await cb2(db._query, {
          query: "SELECT * FROM registration_tokens",
        });
        cb(null, data.rows);
      } else if (query.token != null && query.token != "") {
        // upsert an existing one
        const { token, descr, expires, limit, disabled } = query;
        await cb2(db._query, {
          query: `INSERT INTO registration_tokens ("token","descr","expires","limit","disabled")
                  VALUES ($1, $2, $3, $4, $5) ON CONFLICT (token)
                  DO UPDATE SET
                    "token"    = EXCLUDED.token,
                    "descr"    = EXCLUDED.descr,
                    "expires"  = EXCLUDED.expires,
                    "limit"    = EXCLUDED.limit,
                    "disabled" = EXCLUDED.disabled`,
          params: [
            token,
            descr ? descr : null,
            expires ? expires : null,
            limit >= 0 ? limit : null,
            disabled != null ? disabled : false,
          ],
        });
        cb(null);
      } else {
        throw new Error("don't know what to do with this query");
      }
    }
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
        },
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
        },
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
