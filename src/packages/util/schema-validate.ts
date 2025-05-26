/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Given a query, do some validation on it, and also possibly fill in fields
// in the query that are determined by functional calls in the schema.
// If validation fails, this returns an error message; if validation succeeds,
// it returns undefined.  The input query may be mutated in place.

import * as misc from "./misc";
import * as schema from "./schema";

export function validate_client_query(query, account_id: string) {
  let f, is_set_query, k, S;
  if (misc.is_array(query)) {
    // it's an array of queries; validate each separately.
    for (const q of query) {
      const err = validate_client_query(q, account_id);
      if (err != null) {
        return err;
      }
    }
    return;
  }

  function warn(err) {
    console.warn(`invalid client query: ${err}; query=${misc.to_json(query)}`);
    return err;
  }

  let v = misc.keys(query);
  if (v.length !== 1) {
    return warn(
      `must specify exactly one key in the query (the table name), but ${v.length} keys ${JSON.stringify(v)} were specified -- query=${JSON.stringify(
        query,
      )}`,
    );
  }
  const table = v[0];
  // Check that the table is in the schema
  if (schema.SCHEMA[table] == null) {
    return warn(`no user queries of '${table}' allowed`);
  }
  const user_query = schema.SCHEMA[table].user_query;
  let pattern = query[table];
  if (misc.is_array(pattern)) {
    // get queries are an array or a pattern with a null leaf
    if (pattern.length > 1) {
      return warn("array of length > 1 not yet implemented");
    }
    pattern = pattern[0];
    is_set_query = false;
  } else {
    // set queries do not have any null leafs
    is_set_query = !misc.has_null_leaf(pattern);
  }

  if (is_set_query) {
    S = user_query?.set;
    if (S == null) {
      return warn(`no user set queries of table '${table}' allowed`);
    }
  } else {
    S = user_query?.get;
    if (S == null) {
      return warn(`no user get queries of table '${table}' allowed`);
    }
  }

  for (k in pattern) {
    // Verify that every key of the pattern is in the schema
    v = pattern[k];
    f = S.fields[k];
    if (f === undefined) {
      // crucial: we don't just need "f?" to be true
      if (is_set_query) {
        return warn(`not allowed to set key '${k}' of '${table}'`);
      } else {
        return warn(`not allowed to access key '${k}' of '${table}'`);
      }
    }
  }

  // Fill in any function call parts of the pattern
  for (k in S.fields) {
    f = S.fields[k];
    if (typeof f === "function") {
      const val = f(pattern, schema.client_db, account_id);
      if (val != null) {
        // only if != null -- this shouldn't change get queries to set queries...
        // also if val === undefined don't set that (this broke after switch to MsgPack)
        pattern[k] = val;
      }
    }
  }

  if (S.required_fields != null) {
    for (k in S.required_fields) {
      v = S.required_fields[k];
      if (pattern[k] == null) {
        return warn(`field '${k}' must be set`);
      }
    }
  }
}
