import { schema } from "./db-schema";
import { account_creation_actions } from "./account-creation-actions";
import { accounts } from "./accounts";
import { lti } from "./lti";
const misc = require("../misc");

export const SCHEMA = { ...schema, account_creation_actions, accounts, lti };

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE
} from "./defaults";

export { site_settings_conf } from "./site-defaults";

// Client side versions of some db functions, which are used, e.g., when setting fields.
const sha1 = require("sha1");
class ClientDB {
  private _primary_keys_cache;
  public r;

  constructor() {
    this.sha1 = this.sha1.bind(this);
    this._user_set_query_project_users = this._user_set_query_project_users.bind(
      this
    );
    this._user_set_query_project_change_after = this._user_set_query_project_change_after.bind(
      this
    );
    this._user_set_query_project_change_before = this._user_set_query_project_change_before.bind(
      this
    );
    this.primary_keys = this.primary_keys.bind(this);
    this.r = {};
  }

  sha1(...args) {
    let v;
    try {
      v = args
        .map(x => (typeof x === "string" ? x : JSON.stringify(x)))
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

  primary_keys(table) {
    if (this._primary_keys_cache == null) {
      this._primary_keys_cache = {};
    }
    if (this._primary_keys_cache[table] != null) {
      return this._primary_keys_cache[table];
    }
    let t = SCHEMA[table];
    if (t.virtual != null) {
      t = SCHEMA[t.virtual];
    }
    const v = t != null ? t.primary_key : undefined;
    if (v == null) {
      throw Error(
        `primary key for table '${table}' must be explicitly specified in schema`
      );
    }
    if (typeof v === "string") {
      return (this._primary_keys_cache[table] = [v]);
    } else if (misc.is_array(v)) {
      if (v.length === 0) {
        throw Error("at least one primary key must specified");
      }
      return (this._primary_keys_cache[table] = v);
    } else {
      throw Error("primary key must be a string or array of strings");
    }
  }
}

export const client_db = new ClientDB();
