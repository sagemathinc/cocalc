/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Client side versions of some db functions, which are used, e.g., when setting fields.

import { is_array } from "../misc";
import { SCHEMA } from "./index";
import { sha1 } from "@cocalc/util/misc";

class ClientDB {
  private _primary_keys_cache;
  public r;

  constructor() {
    this.sha1 = this.sha1.bind(this);
    this._user_set_query_project_users =
      this._user_set_query_project_users.bind(this);
    this._user_set_query_project_change_after =
      this._user_set_query_project_change_after.bind(this);
    this._user_set_query_project_change_before =
      this._user_set_query_project_change_before.bind(this);
    this.primary_keys = this.primary_keys.bind(this);
    this.r = {};
  }

  sha1(...args) {
    let v;
    try {
      v = args
        .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
        .join("");
    } catch (err) {
      if (console != null && console.warn != null) {
        console.warn("args=", args);
      }
      throw err;
    }
    return sha1(v);
  }

  _user_set_query_project_users(obj) {
    // client allows anything; server may be more stringent
    return obj.users;
  }

  _user_set_query_project_change_after(_obj, _old_val, _new_val, cb) {
    cb();
  }
  _user_set_query_project_change_before(_obj, _old_val, _new_val, cb) {
    cb();
  }

  // table is either name of a table in the default SCHEMA, or
  // it can be a TableSchema<any> object (for a non-virtual table).
  primary_keys(table) {
    if (this._primary_keys_cache == null) {
      this._primary_keys_cache = {};
    }
    const key = typeof table == "string" ? table : table.name;
    if (this._primary_keys_cache[key] != null) {
      return this._primary_keys_cache[key];
    }
    let t = typeof table == "string" ? SCHEMA[table] : table;
    if (typeof t.virtual == "string") {
      t = SCHEMA[t.virtual];
    }
    const v = t != null ? t.primary_key : undefined;
    if (v == null) {
      throw Error(
        `primary key for table '${table}' must be explicitly specified in schema`,
      );
    }
    if (typeof v === "string") {
      return (this._primary_keys_cache[key] = [v]);
    } else if (is_array(v) && typeof v == "object") {
      // the typeof is just to make typescript happy
      if (v.length === 0) {
        throw Error("at least one primary key must specified");
      }
      return (this._primary_keys_cache[key] = v);
    } else {
      throw Error("primary key must be a string or array of strings");
    }
  }
}

export const client_db = new ClientDB();
