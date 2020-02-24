import { schema } from "./db-schema";
import { account_creation_actions } from "./account-creation-actions";
import { account_profiles } from "./account-profiles";
import { accounts } from "./accounts";
import { blobs } from "./blobs";
import { client_error_log } from "./client-error-log";
import { webapp_errors } from "./webapp-errors";
import { lti } from "./lti";
import {
  site_licenses,
  site_license_usage_stats,
  site_license_public_info,
  projects_using_site_license,
  site_license_usage_log
} from "./site-licenses";
import { listings } from "./listings";
import { file_use_times } from "./file-use-times";
import { central_log } from "./central-log";
const misc = require("../misc");

export const SCHEMA = {
  ...schema,
  accounts,
  account_creation_actions,
  account_profiles,
  blobs,
  central_log,
  client_error_log,
  file_use_times,
  listings,
  lti,
  projects_using_site_license,
  site_licenses,
  site_license_usage_stats,
  site_license_public_info,
  site_license_usage_log,
  webapp_errors
};

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
    if (typeof t.virtual == "string") {
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
