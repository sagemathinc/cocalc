/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

`\
User (and project) client queries

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : MS-RSL\
`;

const MAX_CHANGEFEEDS_PER_CLIENT = 2000;

// Reject all patches that have timestamp that is more than 3 minutes in the future.
const MAX_PATCH_FUTURE_MS = 1000 * 60 * 3;

import async from "async";
import lodash from "lodash";

import { callback2 } from "@cocalc/util/async-utils";
import { checkProjectName } from "@cocalc/util/db-schema/name-rules";
import * as misc from "@cocalc/util/misc";
import { PROJECT_UPGRADES, SCHEMA } from "@cocalc/util/schema";
import type { CB } from "@cocalc/util/types/callback";

import { updateRetentionData } from "../postgres/retention";
import {
  cancelUserQueries,
  type CancelUserQueriesOptions,
} from "./cancel-user-queries";
import { UserQueryQueue } from "./queue";
import { queryIsCmp, userGetQueryFilter } from "./user-get-query";

// Import from CoffeeScript postgres-base (not yet migrated).
// Prefer compiled output for Jest, but fall back for runtime/dist usage.
const base = (() => {
  try {
    return require("../dist/postgres-base");
  } catch (err) {
    return require("../postgres-base");
  }
})();
const uuid = require("uuid");
const { one_result, all_results, count_result, pg_type, quote_field } = base;

const { defaults } = misc;
const { required } = defaults;

type AnyRecord = Record<string, any>;
type QueryOption = Record<string, any>;

type UserQueryChanges = {
  id: string;
  cb?: CB;
};

type UserQueryOptions = {
  client_id?: string;
  priority?: number;
  account_id?: string;
  project_id?: string;
  query: any;
  options?: QueryOption[];
  changes?: string;
  cb?: CB;
};

type UserQueryArrayOptions = Omit<UserQueryOptions, "query"> & {
  query: any[];
};

type UserSetQueryOptions = {
  account_id?: string;
  project_id?: string;
  table: string;
  query: AnyRecord;
  options?: QueryOption[];
  cb: CB;
};

type UserGetQueryOptions = {
  account_id?: string;
  project_id?: string;
  table: string;
  query: AnyRecord;
  multi: boolean;
  options: QueryOption[];
  changes?: UserQueryChanges;
  cb: CB;
};

type QueryParseOptions = {
  only_changes?: boolean;
  limit?: number;
  slice?: any;
  order_by?: string;
  err?: string;
};

type ParsedSetQueryOptions = AnyRecord & {
  err?: string;
  dbg?: (msg?: string) => void;
  query?: AnyRecord;
  table?: string;
  db_table?: string;
  account_id?: string;
  project_id?: string;
  client_query?: AnyRecord;
  require_project_ids_write_access?: string[];
  require_project_ids_owner?: string[];
  require_admin?: boolean;
  primary_keys?: string[];
  json_fields?: AnyRecord;
  check_hook?: (...args: any[]) => void;
  before_change_hook?: (...args: any[]) => void;
  instead_of_change_hook?: (...args: any[]) => void;
  on_change_hook?: (...args: any[]) => void;
  instead_of_query?: (...args: any[]) => void;
  options?: AnyRecord;
  old_val?: AnyRecord;
  done?: boolean;
};

type ParsedGetQueryOptions = AnyRecord & {
  err?: string;
  client_query?: AnyRecord;
  table?: string;
  primary_keys?: string[];
  require_admin?: boolean;
  json_fields?: AnyRecord;
};

type ChangefeedLocals = {
  result?: any;
  changes_cb?: CB;
  changes_queue?: Array<{ err?: any; obj?: any }>;
};

type ProjectControl = {
  restart: () => Promise<void>;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  setAllQuotas?: () => Promise<void>;
};

type RetentionOptions = Parameters<typeof updateRetentionData>[0];

type ProjectActionRequest = AnyRecord & {
  action: string;
  time?: any;
  started?: Date;
  finished?: Date;
  err?: any;
};

type ProjectActionOptions = {
  project_id: string;
  action_request: ProjectActionRequest;
  cb: CB;
};

type LegacyTableSchema = {
  fields?: AnyRecord;
  virtual?: string;
  anonymous?: boolean;
  user_query?: AnyRecord;
  project_query?: AnyRecord;
  admin_query?: AnyRecord;
  changefeed_keys?: string[];
  pg_nestloop?: boolean;
  pg_indexscan?: boolean;
};

const schema = SCHEMA as Record<string, LegacyTableSchema>;

export function extend_PostgreSQL(ext) {
  return class PostgreSQL extends ext {
    // Cancel all queued up queries by the given client
    constructor(...args) {
      super(...args);
      // Bind all methods automatically instead of explicitly binding each one
      misc.bind_methods(this);
    }

    cancel_user_queries(opts: CancelUserQueriesOptions) {
      return cancelUserQueries(this as any, opts);
    }

    user_query(opts: UserQueryOptions) {
      opts = defaults(opts, {
        client_id: undefined, // if given, uses to control number of queries at once by one client.
        priority: undefined, // (NOT IMPLEMENTED) priority for this query (an integer [-10,...,19] like in UNIX)
        account_id: undefined,
        project_id: undefined,
        query: required,
        options: [],
        changes: undefined,
        cb: undefined,
      });
      opts.options ??= [];

      if (opts.account_id != null) {
        // Check for "sudo" by admin to query as a different user, which is done by specifying
        //    options = [..., {account_id:'uuid'}, ...].
        for (var x of opts.options ?? []) {
          if (x.account_id != null) {
            // Check user is an admin, then change opts.account_id
            this.get_account({
              columns: ["groups"],
              account_id: opts.account_id,
              cb: (err, r) => {
                if (err) {
                  return typeof opts.cb === "function"
                    ? opts.cb(err)
                    : undefined;
                } else if (
                  r["groups"] != null &&
                  r["groups"].includes("admin")
                ) {
                  opts.account_id = x.account_id;
                  opts.options = (() => {
                    const result: QueryOption[] = [];
                    for (var y of opts.options ?? []) {
                      if (y["account_id"] == null) {
                        result.push(y);
                      }
                    }
                    return result;
                  })();
                  // now do query with new opts and options not including account_id sudo.
                  return this.user_query(opts);
                } else {
                  return typeof opts.cb === "function"
                    ? opts.cb("user must be admin to sudo")
                    : undefined;
                }
              },
            });
            return;
          }
        }
      }

      if (opts.client_id == null) {
        // No client_id given, so do not use query queue.
        delete opts.priority;
        delete opts.client_id;
        this._user_query(opts);
        return;
      }

      if (this._user_query_queue == null) {
        const o = {
          do_query: this._user_query,
          dbg: this._dbg("user_query_queue"),
          concurrent: this.concurrent,
        };
        this._user_query_queue ??= new UserQueryQueue(o);
      }

      return this._user_query_queue.user_query(opts);
    }

    _user_query(opts: UserQueryOptions) {
      let changes: UserQueryChanges | undefined;
      let multi: boolean;
      let options: QueryOption[] = [];
      let x: QueryOption;
      opts = defaults(opts, {
        account_id: undefined,
        project_id: undefined,
        query: required,
        options: [], // used for initial query; **IGNORED** by changefeed!;
        //  - Use [{set:true}] or [{set:false}] to force get or set query
        //  - For a set query, use {delete:true} to delete instead of set.  This is the only way
        //    to delete a record, and won't work unless delete:true is set in the schema
        //    for the table to explicitly allow deleting.
        changes: undefined, // id of change feed
        cb: undefined,
      }); // cb(err, result)  # WARNING -- this *will* get called multiple times when changes is true!
      opts.options ??= [];
      const id = misc.uuid().slice(0, 6);
      const dbg = this._dbg(`_user_query(id=${id})`);
      dbg(misc.to_json(opts.query));
      if (misc.is_array(opts.query)) {
        dbg("array query instead");
        this._user_query_array(opts);
        return;
      }

      const subs = {
        "{account_id}": opts.account_id,
        "{project_id}": opts.project_id,
        "{now}": new Date(),
      };

      if (opts.changes != null) {
        changes = {
          id: opts.changes,
          cb: opts.cb,
        } as UserQueryChanges;
      }

      const v = misc.keys(opts.query);
      if (v.length > 1) {
        dbg("FATAL no key");
        if (typeof opts.cb === "function") {
          opts.cb("FATAL: must specify exactly one key in the query");
        }
        return;
      }
      const table = v[0];
      let query = opts.query[table];
      if (misc.is_array(query)) {
        if (query.length > 1) {
          dbg("FATAL not implemented");
          if (typeof opts.cb === "function") {
            opts.cb("FATAL: array of length > 1 not yet implemented");
          }
          return;
        }
        multi = true;
        query = query[0];
      } else {
        multi = false;
      }
      let is_set_query: boolean | undefined = undefined;
      if (opts.options != null) {
        if (!misc.is_array(opts.options)) {
          dbg("FATAL options");
          if (typeof opts.cb === "function") {
            opts.cb(
              `FATAL: options (=${misc.to_json(opts.options)}) must be an array`,
            );
          }
          return;
        }
        for (x of opts.options) {
          if (x.set != null) {
            is_set_query = !!x.set;
          }
        }
        options = (() => {
          const result: QueryOption[] = [];
          for (x of opts.options) {
            if (x.set == null) {
              result.push(x);
            }
          }
          return result;
        })();
      } else {
        options = [];
      }

      if (misc.is_object(query)) {
        query = misc.deep_copy(query);
        misc.obj_key_subs(query, subs);
        if (is_set_query == null) {
          is_set_query = !misc.has_null_leaf(query);
        }
        if (is_set_query) {
          dbg("do a set query");
          if (changes) {
            dbg("FATAL: changefeed");
            if (typeof opts.cb === "function") {
              opts.cb("FATAL: changefeeds only for read queries");
            }
            return;
          }
          if (opts.account_id == null && opts.project_id == null) {
            dbg("FATAL: anon set");
            if (typeof opts.cb === "function") {
              opts.cb("FATAL: no anonymous set queries");
            }
            return;
          }
          dbg("user_set_query");
          return this.user_set_query({
            account_id: opts.account_id,
            project_id: opts.project_id,
            table,
            query,
            options: opts.options,
            cb: (err, x) => {
              dbg(`returned ${err}`);
              return typeof opts.cb === "function"
                ? opts.cb(err, { [table]: x })
                : undefined;
            },
          });
        } else {
          // do a get query
          if (changes && !multi) {
            dbg("FATAL: changefeed multi");
            if (typeof opts.cb === "function") {
              opts.cb(
                "FATAL: changefeeds only implemented for multi-document queries",
              );
            }
            return;
          }

          if (changes) {
            const err = this._inc_changefeed_count(
              opts.account_id,
              opts.project_id,
              table,
              changes.id,
            );
            if (err) {
              dbg(`err changefeed count -- ${err}`);
              if (typeof opts.cb === "function") {
                opts.cb(err);
              }
              return;
            }
          }

          dbg("user_get_query");
          return this.user_get_query({
            account_id: opts.account_id,
            project_id: opts.project_id,
            table,
            query,
            options,
            multi,
            changes,
            cb: (err, x) => {
              dbg(`returned ${err}`);
              if (err && changes) {
                // didn't actually make the changefeed, so don't count it.
                this._dec_changefeed_count(changes.id, table);
              }
              return typeof opts.cb === "function"
                ? opts.cb(err, !err ? { [table]: x } : undefined)
                : undefined;
            },
          });
        }
      } else {
        dbg("FATAL - invalid table");
        return typeof opts.cb === "function"
          ? opts.cb(
              `FATAL: invalid user_query of '${table}' -- query must be an object`,
            )
          : undefined;
      }
    }

    /*
    TRACK CHANGEFEED COUNTS

    _inc and dec below are evidently broken, in that it's CRITICAL that they match up exactly, or users will be
    locked out until they just happen to switch to another hub with different tracking, which is silly.

    TODO: DISABLED FOR NOW!
    */

    // Increment a count of the number of changefeeds by a given client so we can cap it.
    _inc_changefeed_count(
      account_id: string | undefined,
      project_id: string | undefined,
      table: string,
      changefeed_id: string,
    ) {
      return;
      const client_name = `${account_id}-${project_id}`;
      const cnt = (this._user_get_changefeed_counts ??= {});
      const ids = (this._user_get_changefeed_id_to_user ??= {});
      if (cnt[client_name] == null) {
        cnt[client_name] = 1;
      } else if (cnt[client_name] >= MAX_CHANGEFEEDS_PER_CLIENT) {
        return `user may create at most ${MAX_CHANGEFEEDS_PER_CLIENT} changefeeds; please close files, refresh browser, restart project`;
      } else {
        // increment before successfully making get_query to prevent huge bursts causing trouble!
        cnt[client_name] += 1;
      }
      this._dbg(`_inc_changefeed_count(table='${table}')`)(
        `{${client_name}:${cnt[client_name]} ...}`,
      );
      ids[changefeed_id] = client_name;
      return false;
    }

    // Corresponding decrement of count of the number of changefeeds by a given client.
    _dec_changefeed_count(id: string, table?: string) {
      return;
      const client_name = this._user_get_changefeed_id_to_user[id];
      if (client_name != null) {
        let t;
        if (this._user_get_changefeed_counts != null) {
          this._user_get_changefeed_counts[client_name] -= 1;
        }
        delete this._user_get_changefeed_id_to_user[id];
        const cnt = this._user_get_changefeed_counts;
        if (table != null) {
          t = `(table='${table}')`;
        } else {
          t = "";
        }
        return this._dbg(`_dec_changefeed_count${t}`)(
          `counts={${client_name}:${cnt[client_name]} ...}`,
        );
      }
    }

    // Handle user_query when opts.query is an array.  opts below are as for user_query.
    _user_query_array(opts: UserQueryArrayOptions) {
      if (opts.changes && opts.query.length > 1) {
        if (typeof opts.cb === "function") {
          opts.cb("FATAL: changefeeds only implemented for single table");
        }
        return;
      }
      const result: any[] = [];
      const f = (query, cb) => {
        return this.user_query({
          account_id: opts.account_id,
          project_id: opts.project_id,
          query,
          options: opts.options,
          cb: (err, x) => {
            result.push(x);
            return cb(err);
          },
        });
      };
      return async.mapSeries(opts.query, f, (err) => opts.cb?.(err, result));
    }

    user_query_cancel_changefeed(opts: { id: string; cb?: CB }) {
      opts = defaults(opts, {
        id: required,
        cb: undefined,
      }); // not really asynchronous
      const dbg = this._dbg(`user_query_cancel_changefeed(id='${opts.id}')`);
      const feed =
        this._changefeeds != null ? this._changefeeds[opts.id] : undefined;
      if (feed != null) {
        dbg("actually canceling feed");
        this._dec_changefeed_count(opts.id);
        delete this._changefeeds[opts.id];
        feed.close();
      } else {
        dbg("already canceled before (no such feed)");
      }
      return typeof opts.cb === "function" ? opts.cb() : undefined;
    }

    _user_get_query_columns(query, remove_from_query) {
      let v = misc.keys(query);
      if (remove_from_query != null) {
        // If remove_from_query is specified it should be an array of strings
        // and we do not includes these in what is returned.
        v = lodash.difference(v, remove_from_query);
      }
      return v;
    }

    _require_is_admin(account_id: string | undefined, cb: CB) {
      if (account_id == null) {
        cb("FATAL: user must be an admin");
        return;
      }
      return this.is_admin({
        account_id,
        cb: (err, is_admin) => {
          if (err) {
            return cb(err);
          } else if (!is_admin) {
            return cb("FATAL: user must be an admin");
          } else {
            return cb();
          }
        },
      });
    }

    // Ensure that each project_id in project_ids is such that the account is in one of the given
    // groups for the project, or that the account is an admin.  If not, cb(err).
    _require_project_ids_in_groups(
      account_id: string,
      project_ids: string[],
      groups: string[],
      cb: CB,
    ) {
      let require_admin = false;
      return this._query({
        query: `SELECT project_id, users#>'{${account_id}}' AS user FROM projects`,
        where: { "project_id = ANY($)": project_ids },
        cache: true,
        cb: all_results((err, x) => {
          if (err) {
            return cb(err);
          } else {
            const known_project_ids: Record<string, boolean> = {}; // we use this to ensure that each of the given project_ids exists.
            for (var p of x) {
              known_project_ids[p.project_id] = true;
              if (!groups.includes(p.user != null ? p.user.group : undefined)) {
                require_admin = true;
              }
            }
            // If any of the project_ids don't exist, reject the query.
            for (var project_id of project_ids) {
              if (!known_project_ids[project_id]) {
                cb(
                  `FATAL: unknown project_id '${misc.trunc(project_id, 100)}'`,
                );
                return;
              }
            }
            if (require_admin) {
              return this._require_is_admin(account_id, cb);
            } else {
              return cb();
            }
          }
        }),
      });
    }

    _query_parse_options(options: QueryOption[]) {
      const r: QueryParseOptions = {};
      for (var x of options) {
        for (var name in x) {
          var value = x[name];
          switch (name) {
            case "only_changes":
              r.only_changes = !!value;
              break;
            case "limit":
              r.limit = parseInt(value);
              break;
            case "slice":
              r.slice = value;
              break;
            case "order_by":
              if (value[0] === "-") {
                value = value.slice(1) + " DESC ";
              }
              if (r.order_by) {
                r.order_by = r.order_by + ", " + value;
              } else {
                r.order_by = value;
              }
              break;
            case "delete":
              null;
              break;
            // ignore delete here - is parsed elsewhere
            case "heartbeat":
              this._dbg("_query_parse_options")(
                "TODO/WARNING -- ignoring heartbeat option from old client",
              );
              break;
            default:
              r.err = `unknown option '${name}'`;
          }
        }
      }
      // Guard rails: no matter what, all queries are capped with a limit of 100000.
      // TODO: If somehow somebody has, e.g., more than 100K projects, or maybe more
      // than 100K edits of a single file, they could hit this and not realize it.  I
      // had this set at 1000 for a few minutes and it caused me to randomly not have
      // some of my projects.
      const MAX_LIMIT = 100000;
      try {
        const limit = Number(r.limit);
        if (!isFinite(limit)) {
          r.limit = MAX_LIMIT;
        } else if (limit > MAX_LIMIT) {
          r.limit = MAX_LIMIT;
        }
      } catch (error) {
        r.limit = MAX_LIMIT;
      }
      return r;
    }

    /*
    SET QUERIES
    */
    _parse_set_query_opts(opts: UserSetQueryOptions) {
      let dbg: (msg?: string) => void;
      let x: QueryOption;
      let y: string;
      let z: any;
      const r: ParsedSetQueryOptions = {};

      if (opts.project_id != null) {
        dbg = r.dbg = this._dbg(
          `user_set_query(project_id='${opts.project_id}', table='${opts.table}')`,
        );
      } else if (opts.account_id != null) {
        dbg = r.dbg = this._dbg(
          `user_set_query(account_id='${opts.account_id}', table='${opts.table}')`,
        );
      } else {
        return {
          err: `FATAL: account_id or project_id must be specified to set query on table='${opts.table}'`,
        };
      }

      if (schema[opts.table] == null) {
        return { err: `FATAL: table '${opts.table}' does not exist` };
      }

      dbg(misc.to_json(opts.query));

      if (opts.options) {
        dbg(`options=${misc.to_json(opts.options)}`);
      }

      r.query = misc.copy(opts.query);
      r.table = opts.table;
      r.db_table =
        schema[opts.table].virtual != null
          ? schema[opts.table].virtual
          : opts.table;
      r.account_id = opts.account_id;
      r.project_id = opts.project_id;
      const query = r.query as AnyRecord;

      const s = schema[opts.table];

      if (opts.account_id != null) {
        r.client_query = s != null ? s.user_query : undefined;
      } else {
        r.client_query = s != null ? s.project_query : undefined;
      }

      if (
        __guard__(
          r.client_query != null ? r.client_query.set : undefined,
          (x1) => x1.fields,
        ) == null
      ) {
        return {
          err: `FATAL: user set queries not allowed for table '${opts.table}'`,
        };
      }
      const client_query = r.client_query as AnyRecord;

      if (!this._mod_fields(opts.query, client_query)) {
        dbg("shortcut -- no fields will be modified, so nothing to do");
        return;
      }

      for (var field of misc.keys(client_query.set.fields)) {
        if (client_query.set.fields[field] === undefined) {
          return {
            err: `FATAL: user set query not allowed for ${opts.table}.${field}`,
          };
        }
        var val = client_query.set.fields[field];

        if (typeof val === "function") {
          try {
            query[field] = val(query, this);
          } catch (err) {
            return { err: `FATAL: error setting '${field}' -- ${err}` };
          }
        } else {
          switch (val) {
            case "account_id":
              if (r.account_id == null) {
                return {
                  err: "FATAL: account_id must be specified -- make sure you are signed in",
                };
              }
              query[field] = r.account_id;
              break;
            case "project_id":
              if (r.project_id == null) {
                return { err: "FATAL: project_id must be specified" };
              }
              query[field] = r.project_id;
              break;
            case "time_id":
              query[field] = uuid.v1();
              break;
            case "project_write":
              if (query[field] == null) {
                return { err: `FATAL: must specify ${opts.table}.${field}` };
              }
              r.require_project_ids_write_access = [query[field]];
              break;
            case "project_owner":
              if (query[field] == null) {
                return { err: `FATAL: must specify ${opts.table}.${field}` };
              }
              r.require_project_ids_owner = [query[field]];
              break;
          }
        }
      }

      if (client_query.set.admin) {
        r.require_admin = true;
      }

      r.primary_keys = this._primary_keys(r.db_table as string);
      const primary_keys = r.primary_keys ?? [];

      r.json_fields = this._json_fields(r.db_table as string, query);

      for (var k in query) {
        if (primary_keys.includes(k)) {
          continue;
        }
        if (
          __guard__(
            __guard__(
              client_query != null ? client_query.set : undefined,
              (x3) => x3.fields,
            ),
            (x2) => x2[k],
          ) !== undefined
        ) {
          continue;
        }
        if (
          __guard__(
            __guard__(
              s.admin_query != null ? s.admin_query.set : undefined,
              (x5) => x5.fields,
            ),
            (x4) => x4[k],
          ) !== undefined
        ) {
          r.require_admin = true;
          continue;
        }
        return { err: `FATAL: changing ${r.table}.${k} not allowed` };
      }

      // HOOKS which allow for running arbitrary code in response to
      // user set queries.  In each case, new_val below is only the part
      // of the object that the user requested to change.

      // 0. CHECK: Runs before doing any further processing; has callback, so this
      // provides a generic way to quickly check whether or not this query is allowed
      // for things that can't be done declaratively.  The check_hook can also
      // mutate the obj (the user query), e.g., to enforce limits on input size.
      r.check_hook = client_query.set.check_hook;

      // 1. BEFORE: If before_change is set, it is called with input
      //   (database, old_val, new_val, account_id, cb)
      // before the actual change to the database is made.
      r.before_change_hook = client_query.set.before_change;

      // 2. INSTEAD OF: If instead_of_change is set, then instead_of_change_hook
      // is called with input
      //      (database, old_val, new_val, account_id, cb)
      // *instead* of actually doing the update/insert to
      // the database.  This makes it possible to run arbitrary
      // code whenever the user does a certain type of set query.
      // Obviously, if that code doesn't set the new_val in the
      // database, then new_val won't be the new val.
      r.instead_of_change_hook = client_query.set.instead_of_change;

      // 3. AFTER:  If set, the on_change_hook is called with
      //   (database, old_val, new_val, account_id, cb)
      // after everything the database has been modified.
      r.on_change_hook = client_query.set.on_change;

      // 4. instead of query
      r.instead_of_query = client_query.set.instead_of_query;

      //dbg("on_change_hook=#{on_change_hook?}, #{misc.to_json(misc.keys(client_query.set))}")

      // Set the query options -- order doesn't matter for set queries (unlike for get), so we
      // just merge the options into a single dictionary.
      // NOTE: As I write this, there is just one supported option: {delete:true}.
      r.options = {};
      if (client_query.set.options != null) {
        for (x of client_query.set.options) {
          for (y in x) {
            z = x[y];
            r.options[y] = z;
          }
        }
      }
      if (opts.options != null) {
        for (x of opts.options) {
          for (y in x) {
            z = x[y];
            r.options[y] = z;
          }
        }
      }
      dbg(`options = ${misc.to_json(r.options)}`);

      if (r.options.delete && !client_query.set.delete) {
        // delete option is set, but deletes aren't explicitly allowed on this table.  ERROR.
        return { err: `FATAL: delete from ${r.table} not allowed` };
      }

      return r;
    }

    _user_set_query_enforce_requirements(r: ParsedSetQueryOptions, cb: CB) {
      return async.parallel(
        [
          (cb: CB) => {
            if (r.require_admin) {
              return this._require_is_admin(r.account_id, cb);
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            if (r.require_project_ids_write_access != null) {
              if (r.project_id != null) {
                let err: string | undefined = undefined;
                for (var x of r.require_project_ids_write_access) {
                  if (x !== r.project_id) {
                    err = "FATAL: can only query same project";
                    break;
                  }
                }
                return cb(err);
              } else {
                return this._require_project_ids_in_groups(
                  r.account_id as string,
                  r.require_project_ids_write_access,
                  ["owner", "collaborator"],
                  cb,
                );
              }
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            if (r.require_project_ids_owner != null) {
              return this._require_project_ids_in_groups(
                r.account_id as string,
                r.require_project_ids_owner,
                ["owner"],
                cb,
              );
            } else {
              return cb();
            }
          },
        ],
        cb,
      );
    }

    _user_set_query_where(r: ParsedSetQueryOptions) {
      const where: AnyRecord = {};
      const db_table = r.db_table as string;
      const query = r.query as AnyRecord;
      const fields = schema[db_table].fields ?? {};
      for (var primary_key of this._primary_keys(db_table)) {
        var value = query[primary_key];
        const fieldSpec = fields[primary_key] ?? {};
        if (fieldSpec.noCoerce) {
          where[`${primary_key}=$`] = value;
        } else {
          var type = pg_type(fieldSpec);
          if (type === "TIMESTAMP" && !misc.is_date(value)) {
            // Javascript is better at parsing its own dates than PostgreSQL
            // isNaN test so NOW(), etc. work still
            var x = new Date(value);
            if (!Number.isNaN(x.getTime())) {
              value = x;
            }
          }
          where[`${primary_key}=$::${type}`] = value;
        }
      }
      return where;
    }

    _user_set_query_values(r: ParsedSetQueryOptions) {
      const values: AnyRecord = {};
      const query = r.query as AnyRecord;
      const s = schema[r.db_table as string];
      for (var key in query) {
        var value = query[key];
        var type = pg_type(
          __guard__(s != null ? s.fields : undefined, (x1) => x1[key]),
        );
        if (
          value != null &&
          type != null &&
          !__guard__(
            __guard__(s != null ? s.fields : undefined, (x3) => x3[key]),
            (x2) => x2.noCoerce,
          )
        ) {
          if (type === "TIMESTAMP" && !misc.is_date(value)) {
            // (as above) Javascript is better at parsing its own dates than PostgreSQL
            var x = new Date(value);
            if (!Number.isNaN(x.getTime())) {
              value = x;
            }
          }
          values[`${key}::${type}`] = value;
        } else {
          values[key] = value;
        }
      }
      return values;
    }

    _user_set_query_hooks_prepare(r: ParsedSetQueryOptions, cb: CB) {
      const query = r.query as AnyRecord;
      if (
        r.on_change_hook != null ||
        r.before_change_hook != null ||
        r.instead_of_change_hook != null
      ) {
        for (var primary_key of r.primary_keys ?? []) {
          if (query[primary_key] == null) {
            // this is fine -- it just means the old_val isn't defined.
            // this can happen, e.g., when creating a new object with a primary key that is a generated id.
            cb();
            return;
          }
        }
        // get the old value before changing it
        // TODO: optimization -- can we restrict columns below?
        return this._query({
          query: `SELECT * FROM ${r.db_table}`,
          where: this._user_set_query_where(r),
          cb: one_result((err, x) => {
            r.old_val = x;
            return cb(err);
          }),
        });
      } else {
        return cb();
      }
    }

    _user_query_set_count(r: ParsedSetQueryOptions, cb: CB) {
      return this._query({
        query: `SELECT COUNT(*) FROM ${r.db_table}`,
        where: this._user_set_query_where(r),
        cb: count_result(cb),
      });
    }

    _user_query_set_delete(r: ParsedSetQueryOptions, cb: CB) {
      return this._query({
        query: `DELETE FROM ${r.db_table}`,
        where: this._user_set_query_where(r),
        cb,
      });
    }

    _user_set_query_conflict(r: ParsedSetQueryOptions) {
      return r.primary_keys ?? [];
    }

    _user_query_set_upsert(r: ParsedSetQueryOptions, cb: CB) {
      // r.dbg("_user_query_set_upsert #{JSON.stringify(r.query)}")
      return this._query({
        query: `INSERT INTO ${r.db_table}`,
        values: this._user_set_query_values(r),
        conflict: this._user_set_query_conflict(r),
        cb,
      });
    }

    // Record is already in DB, so we update it:
    // this function handles a case that involves both
    // a jsonb_merge and an update.
    _user_query_set_upsert_and_jsonb_merge(r: ParsedSetQueryOptions, cb: CB) {
      let k, v;
      const jsonb_merge: AnyRecord = {};
      const primary_keys = r.primary_keys ?? [];
      const query = r.query as AnyRecord;
      for (k in r.json_fields) {
        v = query[k];
        if (v != null) {
          jsonb_merge[k] = v;
        }
      }
      const set: AnyRecord = {};
      for (k in query) {
        v = query[k];
        if (!primary_keys.includes(k) && jsonb_merge[k] == null) {
          set[k] = v;
        }
      }
      return this._query({
        query: `UPDATE ${r.db_table}`,
        jsonb_merge,
        set,
        where: this._user_set_query_where(r),
        cb,
      });
    }

    _user_set_query_main_query(r: ParsedSetQueryOptions, cb: CB) {
      const dbg = r.dbg ?? (() => {});
      dbg("_user_set_query_main_query");
      const query = r.query as AnyRecord;
      const client_query = r.client_query as AnyRecord;
      const options = r.options ?? {};
      const primary_keys = r.primary_keys ?? [];

      if (!client_query.set.allow_field_deletes) {
        // allow_field_deletes not set, so remove any null/undefined
        // fields from the query
        for (var key in query) {
          if (query[key] == null) {
            delete query[key];
          }
        }
      }

      if (options.delete) {
        for (var primary_key of primary_keys) {
          if (query[primary_key] == null) {
            cb("FATAL: delete query must set primary key");
            return;
          }
        }
        dbg("delete based on primary key");
        this._user_query_set_delete(r, cb);
        return;
      }
      if (r.instead_of_change_hook != null) {
        return r.instead_of_change_hook(
          this,
          r.old_val,
          query,
          r.account_id,
          cb,
        );
      } else {
        if (misc.len(r.json_fields) === 0) {
          // easy case -- there are no jsonb merge fields; just do an upsert.
          this._user_query_set_upsert(r, cb);
          return;
        }
        // HARD CASE -- there are json_fields... so we are doing an insert
        // if the object isn't already in the database, and an update
        // if it is.  This is ugly because I don't know how to do both
        // a JSON merge as an upsert.
        let cnt = undefined; // will equal number of records having the primary key (so 0 or 1)
        return async.series(
          [
            (cb: CB) => {
              return this._user_query_set_count(r, (err, n) => {
                cnt = n;
                return cb(err);
              });
            },
            (cb: CB) => {
              dbg("do the set query");
              if (cnt === 0) {
                // Just insert (do as upsert to avoid error in case of race)
                return this._user_query_set_upsert(r, cb);
              } else {
                // Do as an update -- record is definitely already in db since cnt > 0.
                // This would fail in the unlikely (but possible) case that somebody deletes
                // the record between the above count and when we do the UPDATE.
                // Using a transaction could avoid this.
                // Maybe such an error is reasonable and it's good to report it as such.
                return this._user_query_set_upsert_and_jsonb_merge(r, cb);
              }
            },
          ],
          cb,
        );
      }
    }

    user_set_query(opts: UserSetQueryOptions) {
      opts = defaults(opts, {
        account_id: undefined,
        project_id: undefined,
        table: required,
        query: required,
        options: undefined, // options=[{delete:true}] is the only supported nontrivial option here.
        cb: required,
      }); // cb(err)

      // TODO: it would be nice to return the primary key part of the created object on creation.
      // That's not implemented and will be somewhat nontrivial, and will use the RETURNING clause
      // of postgres's INSERT - https://www.postgresql.org/docs/current/sql-insert.html

      if (this.is_standby) {
        opts.cb("set queries against standby not allowed");
        return;
      }
      const r = this._parse_set_query_opts(opts);

      // Only uncomment for debugging -- too big/verbose/dangerous
      // r.dbg("parsed query opts = #{JSON.stringify(r)}")

      if (r == null) {
        // nothing to do
        opts.cb();
        return;
      }
      if (r.err) {
        opts.cb(r.err);
        return;
      }
      const query = r.query as AnyRecord;

      return async.series(
        [
          (cb: CB) => {
            return this._user_set_query_enforce_requirements(r, cb);
          },
          (cb: CB) => {
            if (r.check_hook != null) {
              const check_hook = r.check_hook;
              return check_hook(this, query, r.account_id, r.project_id, cb);
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            return this._user_set_query_hooks_prepare(r, cb);
          },
          (cb: CB) => {
            if (r.before_change_hook != null) {
              const before_change_hook = r.before_change_hook;
              return before_change_hook(
                this,
                r.old_val,
                query,
                r.account_id,
                (err, stop) => {
                  r.done = stop;
                  return cb(err);
                },
              );
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            if (r.done) {
              cb();
              return;
            }
            if (r.instead_of_query != null) {
              const opts1 = misc.copy_without(opts, ["cb", "changes", "table"]);
              const instead_of_query = r.instead_of_query;
              return instead_of_query(this, opts1, cb);
            } else {
              return this._user_set_query_main_query(r, cb);
            }
          },
          (cb: CB) => {
            if (r.done) {
              cb();
              return;
            }
            if (r.on_change_hook != null) {
              const on_change_hook = r.on_change_hook;
              return on_change_hook(this, r.old_val, query, r.account_id, cb);
            } else {
              return cb();
            }
          },
        ],
        (err) => opts.cb(err),
      );
    }

    // mod_fields counts the fields in query that might actually get modified
    // in the database when we do the query; e.g., account_id won't since it gets
    // filled in with the user's account_id, and project_write won't since it must
    // refer to an existing project.  We use mod_field **only** to skip doing
    // no-op queries. It's just an optimization.
    _mod_fields(query: AnyRecord, client_query: AnyRecord) {
      for (var field of misc.keys(query)) {
        if (
          !["account_id", "project_write"].includes(
            client_query.set.fields[field],
          )
        ) {
          return true;
        }
      }
      return false;
    }

    _user_get_query_json_timestamps(obj: AnyRecord, fields: AnyRecord) {
      // obj is an object returned from the database via a query
      // Postgres JSONB doesn't support timestamps, so we convert
      // every json leaf node of obj that looks like JSON of a timestamp
      // to a Javascript Date.
      return (() => {
        const result: any[] = [];
        for (var k in obj) {
          var v = obj[k];
          if (fields[k]) {
            result.push((obj[k] = misc.fix_json_dates(v, fields[k])));
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    // fill in the default values for obj using the client_query spec.
    _user_get_query_set_defaults(
      client_query: AnyRecord,
      obj: AnyRecord | AnyRecord[],
      fields: string[],
    ) {
      if (!misc.is_array(obj)) {
        obj = [obj];
      } else if (obj.length === 0) {
        return;
      }
      const objects = (misc.is_array(obj) ? obj : [obj]) as AnyRecord[];
      const s =
        __guard__(
          client_query != null ? client_query.get : undefined,
          (x1) => x1.fields,
        ) != null
          ? __guard__(
              client_query != null ? client_query.get : undefined,
              (x1) => x1.fields,
            )
          : {};
      return (() => {
        const result: any[] = [];
        for (var k of fields) {
          var v = s[k];
          if (v != null) {
            // k is a field for which a default value (=v) is provided in the schema
            result.push(
              (() => {
                const result1: any[] = [];
                for (var x of objects) {
                  // For each obj pulled from the database that is defined...
                  if (x != null) {
                    // We check to see if the field k was set on that object.
                    var y = x[k];
                    if (y == null) {
                      // It was NOT set, so we deep copy the default value for the field k.
                      result1.push((x[k] = misc.deep_copy(v)));
                    } else if (
                      typeof v === "object" &&
                      typeof y === "object" &&
                      !misc.is_array(v)
                    ) {
                      // y *is* defined and is an object, so we merge in the provided defaults.
                      result1.push(
                        (() => {
                          const result2: any[] = [];
                          for (var k0 in v) {
                            var v0 = v[k0];
                            if (y[k0] == null) {
                              result2.push((y[k0] = v0));
                            } else {
                              result2.push(undefined);
                            }
                          }
                          return result2;
                        })(),
                      );
                    } else {
                      result1.push(undefined);
                    }
                  } else {
                    result1.push(undefined);
                  }
                }
                return result1;
              })(),
            );
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    _user_set_query_project_users(obj: AnyRecord, _account_id: string) {
      if (obj.users == null) {
        // nothing to do -- not changing users.
        return;
      }
      //#dbg("disabled")
      //#return obj.users
      //   - ensures all keys of users are valid uuid's (though not that they are valid users).
      //   - and format is:
      //          {group:'owner' or 'collaborator', hide:bool, upgrades:{a map}}
      //     with valid upgrade fields.
      const upgrade_fields = PROJECT_UPGRADES.params;
      const users: AnyRecord = {};
      // TODO: we obviously should check that a user is only changing the part
      // of this object involving themselves... or adding/removing collaborators.
      // That is not currently done below.  TODO TODO TODO  SECURITY.
      for (var id in obj.users) {
        var x = obj.users[id];
        if (misc.is_valid_uuid_string(id)) {
          var k, key;
          for (key of misc.keys(x)) {
            if (!["group", "hide", "upgrades", "ssh_keys"].includes(key)) {
              throw Error(`unknown field '${key}`);
            }
          }
          if (x.group != null && !["owner", "collaborator"].includes(x.group)) {
            throw Error("invalid value for field 'group'");
          }
          if (x.hide != null && typeof x.hide !== "boolean") {
            throw Error("invalid type for field 'hide'");
          }
          if (x.upgrades != null) {
            if (!misc.is_object(x.upgrades)) {
              throw Error("invalid type for field 'upgrades'");
            }
            for (k in x.upgrades) {
              if (!upgrade_fields[k]) {
                throw Error(`invalid upgrades field '${k}'`);
              }
            }
          }
          if (x.ssh_keys) {
            // do some checks.
            if (!misc.is_object(x.ssh_keys)) {
              throw Error("ssh_keys must be an object");
            }
            for (var fingerprint in x.ssh_keys) {
              key = x.ssh_keys[fingerprint];
              if (!key) {
                // deleting
                continue;
              }
              if (!misc.is_object(key)) {
                throw Error("each key in ssh_keys must be an object");
              }
              for (k in key) {
                // the two dates are just numbers not actual timestamps...
                if (
                  ![
                    "title",
                    "value",
                    "creation_date",
                    "last_use_date",
                  ].includes(k)
                ) {
                  throw Error(`invalid ssh_keys field '${k}'`);
                }
              }
            }
          }
          users[id] = x;
        }
      }
      return users;
    }

    project_action(opts: ProjectActionOptions) {
      opts = defaults(opts, {
        project_id: required,
        action_request: required, // action is object {action:?, time:?}
        cb: required,
      });
      if (opts.action_request.action === "test") {
        // used for testing -- shouldn't trigger anything to happen.
        opts.cb();
        return;
      }
      const dbg = this._dbg(
        `project_action(project_id='${opts.project_id}',action_request=${misc.to_json(opts.action_request)})`,
      );
      dbg();
      let project: ProjectControl | undefined;
      const action_request = misc.copy(
        opts.action_request,
      ) as ProjectActionRequest;
      const set_action_request = (cb: CB) => {
        dbg(`set action_request to ${misc.to_json(action_request)}`);
        return this._query({
          query: "UPDATE projects",
          where: { "project_id = $::UUID": opts.project_id },
          jsonb_set: { action_request },
          cb,
        });
      };
      return async.series(
        [
          (cb: CB) => {
            action_request.started = new Date();
            return set_action_request(cb);
          },
          async (cb: CB) => {
            dbg("get project");
            try {
              project = await this.projectControl(opts.project_id);
              return cb();
            } catch (err) {
              return cb(err);
            }
          },
          async (cb: CB) => {
            dbg("doing action");
            try {
              if (project == null) {
                return cb("project not loaded");
              }
              switch (action_request.action) {
                case "restart":
                  await project.restart();
                  break;
                case "stop":
                  await project.stop();
                  break;
                case "start":
                  await project.start();
                  break;
                default:
                  throw Error(
                    `FATAL: action '${opts.action_request.action}' not implemented`,
                  );
              }
              return cb();
            } catch (err) {
              return cb(err);
            }
          },
        ],
        (err) => {
          if (err) {
            action_request.err = err;
          }
          action_request.finished = new Date();
          dbg("finished!");
          return set_action_request(opts.cb);
        },
      );
    }

    // This hook is called *before* the user commits a change to a project in the database
    // via a user set query.
    // TODO: Add a pre-check here as well that total upgrade isn't going to be exceeded.
    // This will avoid a possible subtle edge case if user is cheating and always somehow
    // crashes server...?
    async _user_set_query_project_change_before(
      old_val: AnyRecord,
      new_val: AnyRecord,
      account_id: string,
      cb: CB,
    ) {
      //dbg = @_dbg("_user_set_query_project_change_before #{account_id}, #{misc.to_json(old_val)} --> #{misc.to_json(new_val)}")
      // I've seen MASSIVE OUTPUT from this, e.g., when setting avatar.
      let err;
      const dbg = this._dbg(
        `_user_set_query_project_change_before ${account_id}`,
      );
      dbg();

      if (
        (new_val != null ? new_val.name : undefined) &&
        (new_val != null ? new_val.name : undefined) !==
          (old_val != null ? old_val.name : undefined)
      ) {
        // Changing or setting the name of the project to something nontrivial.
        try {
          checkProjectName(new_val.name);
        } catch (error) {
          err = error;
          cb(err.toString());
          return;
        }
        if (new_val.name) {
          // Setting name to something nontrivial, so we must check uniqueness
          // among all projects this user owns.
          let result = await callback2(this._query, {
            query: "SELECT COUNT(*) FROM projects",
            where: {
              [`users#>>'{${account_id},group}' = $::TEXT`]: "owner",
              "project_id != $::UUID": new_val.project_id,
              "LOWER(name) = $::TEXT": new_val.name.toLowerCase(),
            },
          });
          if (result.rows[0].count > 0) {
            cb(
              `There is already a project with the same owner as this project and name='${new_val.name}'.   Names are not case sensitive.`,
            );
            return;
          }
          // A second constraint is that only the project owner can change the project name.
          result = await callback2(this._query, {
            query: "SELECT COUNT(*) FROM projects",
            where: {
              [`users#>>'{${account_id},group}' = $::TEXT`]: "owner",
              "project_id = $::UUID": new_val.project_id,
            },
          });
          if (result.rows[0].count === 0) {
            cb(
              "Only the owner of the project can currently change the project name.",
            );
            return;
          }
        }
      }

      if (
        (new_val != null ? new_val.action_request : undefined) != null &&
        JSON.stringify(new_val.action_request.time) !==
          JSON.stringify(
            __guard__(
              old_val != null ? old_val.action_request : undefined,
              (x) => x.time,
            ),
          )
      ) {
        // Requesting an action, e.g., save, restart, etc.
        dbg(`action_request -- ${misc.to_json(new_val.action_request)}`);
        //
        // WARNING: Above, we take the difference of times below, since != doesn't work as we want with
        // separate Date objects, as it will say equal dates are not equal. Example:
        // coffee> x = JSON.stringify(new Date()); {from_json}=require('misc'); a=from_json(x); b=from_json(x); [a!=b, a-b]
        // [ true, 0 ]

        // Launch the action -- success or failure communicated back to all clients through changes to state.
        // Also, we don't have to worry about permissions here; that this function got called at all means
        // the user has write access to the projects table entry with given project_id, which gives them permission
        // to do any action with the project.
        this.project_action({
          project_id: new_val.project_id,
          action_request: misc.copy_with(new_val.action_request, [
            "action",
            "time",
          ]) as ProjectActionRequest,
          cb: (err) => {
            dbg(
              `action_request ${misc.to_json(new_val.action_request)} completed -- ${err}`,
            );
            // true means -- do nothing further.  We don't want to the user to
            // set this same thing since we already dealt with it properly.
            return cb(err, true);
          },
        });
        return;
      }

      if (new_val.users == null) {
        // not changing users
        cb();
        return;
      }
      old_val =
        (old_val != null ? old_val.users : undefined) != null
          ? old_val != null
            ? old_val.users
            : undefined
          : {};
      new_val =
        (new_val != null ? new_val.users : undefined) != null
          ? new_val != null
            ? new_val.users
            : undefined
          : {};
      for (var id of misc.keys(old_val).concat(new_val as any)) {
        if (account_id !== id) {
          // make sure user doesn't change anybody else's allocation
          if (
            !lodash.isEqual(
              __guard__(
                old_val != null ? old_val[id] : undefined,
                (x1) => x1.upgrades,
              ),
              __guard__(
                new_val != null ? new_val[id] : undefined,
                (x2) => x2.upgrades,
              ),
            )
          ) {
            err = `FATAL: user '${account_id}' tried to change user '${id}' allocation toward a project`;
            dbg(err);
            cb(err);
            return;
          }
        }
      }
      return cb();
    }

    // This hook is called *after* the user commits a change to a project in the database
    // via a user set query.  It could undo changes the user isn't allowed to make, which
    // might require doing various async calls, or take actions (e.g., setting quotas,
    // starting projects, etc.).
    async _user_set_query_project_change_after(
      old_val: AnyRecord,
      new_val: AnyRecord,
      account_id: string,
      cb: CB,
    ) {
      const dbg = this._dbg(
        `_user_set_query_project_change_after ${account_id}, ${misc.to_json(old_val)} --> ${misc.to_json(new_val)}`,
      );
      dbg();
      const old_upgrades = __guard__(
        old_val.users != null ? old_val.users[account_id] : undefined,
        (x) => x.upgrades,
      );
      const new_upgrades = __guard__(
        new_val.users != null ? new_val.users[account_id] : undefined,
        (x1) => x1.upgrades,
      );
      if (new_upgrades != null && !lodash.isEqual(old_upgrades, new_upgrades)) {
        dbg(
          `upgrades changed for ${account_id} from ${misc.to_json(old_upgrades)} to ${misc.to_json(new_upgrades)}`,
        );
        let project: ProjectControl | undefined;
        return async.series(
          [
            (cb: CB) => {
              return this.ensure_user_project_upgrades_are_valid({
                account_id,
                cb,
              });
            },
            async (cb: CB) => {
              if (this.projectControl == null) {
                return cb();
              } else {
                dbg("get project");
                try {
                  project = await this.projectControl(new_val.project_id);
                  return cb();
                } catch (err) {
                  return cb(err);
                }
              }
            },
            async (cb: CB) => {
              if (project == null) {
                return cb();
              } else {
                dbg("determine total quotas and apply");
                try {
                  if (project.setAllQuotas == null) {
                    return cb();
                  }
                  await project.setAllQuotas();
                  return cb();
                } catch (err) {
                  return cb(err);
                }
              }
            },
          ],
          cb,
        );
      } else {
        return cb();
      }
    }

    /*
    GET QUERIES
    */

    // Make any functional substitutions defined by the schema.
    // This may mutate query in place.
    _user_get_query_functional_subs(query: AnyRecord, fields?: AnyRecord) {
      if (fields != null) {
        return (() => {
          const result: any[] = [];
          for (var field in fields) {
            var val = fields[field];
            if (typeof val === "function") {
              result.push((query[field] = val(query, this)));
            } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      }
    }

    _parse_get_query_opts(opts: UserGetQueryOptions) {
      let x: QueryOption;
      let y: string;
      if (opts.changes != null && opts.changes.cb == null) {
        return {
          err: "FATAL: user_get_query -- if opts.changes is specified, then opts.changes.cb must also be specified",
        };
      }

      const r: ParsedGetQueryOptions = {};
      // get data about user queries on this table
      if (opts.project_id != null) {
        r.client_query =
          schema[opts.table] != null
            ? schema[opts.table].project_query
            : undefined;
      } else {
        r.client_query =
          schema[opts.table] != null
            ? schema[opts.table].user_query
            : undefined;
      }

      if ((r.client_query != null ? r.client_query.get : undefined) == null) {
        return {
          err: `FATAL: get queries not allowed for table '${opts.table}'`,
        };
      }
      const client_query = r.client_query as AnyRecord;

      if (
        opts.account_id == null &&
        opts.project_id == null &&
        !schema[opts.table].anonymous
      ) {
        return {
          err: `FATAL: anonymous get queries not allowed for table '${opts.table}'`,
        };
      }

      r.table =
        schema[opts.table].virtual != null
          ? schema[opts.table].virtual
          : opts.table;

      r.primary_keys = this._primary_keys(opts.table);

      // Are only admins allowed any get access to this table?
      r.require_admin = !!client_query.get.admin;

      // Verify that all requested fields may be read by users
      for (var field of misc.keys(opts.query)) {
        if (
          (client_query.get.fields != null
            ? client_query.get.fields[field]
            : undefined) === undefined
        ) {
          return {
            err: `FATAL: user get query not allowed for ${opts.table}.${field}`,
          };
        }
      }

      // Functional substitutions defined by schema
      this._user_get_query_functional_subs(
        opts.query,
        client_query.get != null ? client_query.get.fields : undefined,
      );

      if (
        (client_query.get != null
          ? client_query.get.instead_of_query
          : undefined) != null
      ) {
        return r;
      }

      // Sanity check: make sure there is something in the query
      // that gets only things in this table that this user
      // is allowed to see, or at least a check_hook.  This is not required
      // for admins.
      if (
        client_query.get.pg_where == null &&
        client_query.get.check_hook == null &&
        !r.require_admin
      ) {
        return {
          err: `FATAL: user get query not allowed for ${opts.table} (no getAll filter - pg_where or check_hook)`,
        };
      }

      // Apply default options to the get query (don't impact changefeed)
      // The user can override these, e.g., if they were to want to explicitly increase a limit
      // to get more file use history.
      const user_options: Record<string, boolean> = {};
      for (x of opts.options) {
        for (y in x) {
          user_options[y] = true;
        }
      }

      let get_options: QueryOption[] | undefined;
      if (this.is_heavily_loaded() && client_query.get.options_load != null) {
        get_options = client_query.get.options_load;
      } else if (client_query.get.options != null) {
        get_options = client_query.get.options;
      }
      if (get_options != null) {
        // complicated since options is a list of {opt:val} !
        for (x of get_options) {
          for (y in x) {
            if (!user_options[y]) {
              opts.options.push(x);
              break;
            }
          }
        }
      }

      r.json_fields = this._json_fields(opts.table, opts.query);
      return r;
    }

    // _json_fields: map from field names to array of fields that should be parsed as timestamps
    // These keys of his map are also used by _user_query_set_upsert_and_jsonb_merge to determine
    // JSON deep merging for set queries.
    _json_fields(table: string, query: AnyRecord) {
      const json_fields: AnyRecord = {};
      for (var field in schema[table].fields) {
        var info = schema[table].fields[field];
        if (
          (query[field] != null || query[field] === null) &&
          (info.type === "map" || info.pg_type === "JSONB")
        ) {
          json_fields[field] = info.date != null ? info.date : [];
        }
      }
      return json_fields;
    }

    _user_get_query_where(
      client_query: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      user_query: AnyRecord,
      table: string,
      cb: CB,
    ) {
      let value: any;
      let x: any;
      const dbg = this._dbg("_user_get_query_where");
      dbg();

      let { pg_where } = client_query.get;

      if (this.is_heavily_loaded() && client_query.get.pg_where_load != null) {
        // use a different query if load is heavy
        pg_where = client_query.get.pg_where_load;
      }

      if (pg_where == null) {
        pg_where = [];
      }
      if (pg_where === "projects") {
        pg_where = ["projects"];
      }

      if (typeof pg_where === "function") {
        pg_where = pg_where(user_query, this);
      }
      if (!misc.is_array(pg_where)) {
        cb("FATAL: pg_where must be an array (of strings or objects)");
        return;
      }

      // Do NOT mutate the schema itself!
      pg_where = misc.deep_copy(pg_where);

      // expand 'projects' in query, depending on whether project_id is specified or not.
      // This is just a convenience to make the db schema simpler.
      for (
        let i = 0, end = pg_where.length, asc = 0 <= end;
        asc ? i < end : i > end;
        asc ? i++ : i--
      ) {
        if (pg_where[i] === "projects") {
          if (user_query.project_id) {
            pg_where[i] = { "project_id = $::UUID": "project_id" };
          } else {
            pg_where[i] = {
              "project_id = ANY(select project_id from projects where users ? $::TEXT)":
                "account_id",
            };
          }
        }
      }

      // Now we fill in all the parametrized substitutions in the pg_where list.
      const subs: AnyRecord = {};
      for (x of pg_where) {
        if (misc.is_object(x)) {
          for (var _ in x) {
            value = x[_];
            subs[value] = value;
          }
        }
      }

      const sub_value = (value: string, cb: CB) => {
        switch (value) {
          case "account_id":
            if (account_id == null) {
              cb("FATAL: account_id must be given");
              return;
            }
            subs[value] = account_id;
            return cb();
          case "project_id":
            if (project_id != null) {
              subs[value] = project_id;
              return cb();
            } else if (!user_query.project_id) {
              return cb("FATAL: must specify project_id");
            } else if (schema[table].anonymous) {
              subs[value] = user_query.project_id;
              return cb();
            } else {
              return this.user_is_in_project_group({
                account_id,
                project_id: user_query.project_id,
                groups: ["owner", "collaborator"],
                cb: (err, in_group) => {
                  if (err) {
                    return cb(err);
                  } else if (in_group) {
                    subs[value] = user_query.project_id;
                    return cb();
                  } else {
                    return cb(
                      `FATAL: you do not have read access to this project -- account_id=${account_id}, project_id_=${project_id}`,
                    );
                  }
                },
              });
            }
          case "project_id-public":
            if (user_query.project_id == null) {
              return cb("FATAL: must specify project_id");
            } else {
              if (schema[table].anonymous) {
                return this.has_public_path({
                  project_id: user_query.project_id,
                  cb: (err, has_public_path) => {
                    if (err) {
                      return cb(err);
                    } else if (!has_public_path) {
                      return cb("project does not have any public paths");
                    } else {
                      subs[value] = user_query.project_id;
                      return cb();
                    }
                  },
                });
              } else {
                return cb("FATAL: table must allow anonymous queries");
              }
            }
          default:
            return cb();
        }
      };

      return async.map(misc.keys(subs), sub_value, (err) => {
        if (err) {
          cb(err);
          return;
        }
        for (x of pg_where) {
          if (misc.is_object(x)) {
            for (var key in x) {
              value = x[key];
              x[key] = subs[value];
            }
          }
        }

        // impose further restrictions (more where conditions)
        pg_where.push(userGetQueryFilter(user_query, client_query));

        return cb(undefined, pg_where);
      });
    }

    _user_get_query_options(
      options: QueryOption[],
      multi: boolean,
      schema_options?: QueryOption[],
    ) {
      const r: QueryParseOptions = {};

      if (schema_options != null) {
        options = options.concat(schema_options);
      }

      // Parse option part of the query
      const { limit, order_by, slice, only_changes, err } =
        this._query_parse_options(options);

      if (err) {
        return { err };
      }
      if (only_changes) {
        r.only_changes = true;
      }
      if (limit != null) {
        r.limit = limit;
      } else if (!multi) {
        r.limit = 1;
      }
      if (order_by != null) {
        r.order_by = order_by;
      }
      if (slice != null) {
        return { err: "slice not implemented" };
      }
      return r;
    }

    _user_get_query_do_query(
      query_opts: AnyRecord,
      client_query: AnyRecord,
      user_query: AnyRecord,
      multi: boolean,
      json_fields: AnyRecord,
      cb: CB,
    ) {
      query_opts.cb = all_results((err, x) => {
        if (err) {
          return cb(err);
        } else {
          let obj;
          if (misc.len(json_fields) > 0) {
            // Convert timestamps to Date objects, if **explicitly** specified in the schema
            for (obj of x) {
              this._user_get_query_json_timestamps(obj, json_fields);
            }
          }

          if (!multi) {
            x = x[0];
          }
          // Fill in default values and remove null's
          this._user_get_query_set_defaults(
            client_query,
            x,
            misc.keys(user_query),
          );
          // Get rid of undefined fields -- that's the default and wastes memory and bandwidth
          if (x != null && Array.isArray(x)) {
            for (obj of x) {
              misc.map_mutate_out_undefined_and_null(obj);
            }
          }
          return cb(undefined, x);
        }
      });
      return this._query(query_opts);
    }

    _user_get_query_query(
      table: string,
      user_query: AnyRecord,
      remove_from_query?: string[],
    ) {
      return `SELECT ${this._user_get_query_columns(
        user_query,
        remove_from_query,
      )
        .map((field) => quote_field(field))
        .join(",")} FROM ${table}`;
    }

    _user_get_query_satisfied_by_obj(
      user_query: AnyRecord,
      obj: AnyRecord,
      possible_time_fields: AnyRecord,
    ) {
      //dbg = @_dbg("_user_get_query_satisfied_by_obj)
      //dbg(user_query, obj)
      for (var field in obj) {
        var q;
        var value = obj[field];
        var date_keys = possible_time_fields[field];
        if (date_keys) {
          value = misc.fix_json_dates(value, date_keys);
        }
        if ((q = user_query[field]) != null) {
          var op;
          if ((op = queryIsCmp(q))) {
            //dbg(value:value, op: op, q:q)
            var x = q[op];
            switch (op) {
              case "==":
                if (value !== x) {
                  return false;
                }
                break;
              case "!=":
                if (value === x) {
                  return false;
                }
                break;
              case ">=":
                if (value < x) {
                  return false;
                }
                break;
              case "<=":
                if (value > x) {
                  return false;
                }
                break;
              case ">":
                if (value <= x) {
                  return false;
                }
                break;
              case "<":
                if (value >= x) {
                  return false;
                }
                break;
            }
          } else if (value !== q) {
            return false;
          }
        }
      }
      return true;
    }

    _user_get_query_handle_field_deletes(
      client_query: AnyRecord,
      new_val: AnyRecord,
    ) {
      if (client_query.get.allow_field_deletes) {
        // leave in the nulls that might be in new_val
        return;
      }
      // remove all nulls from new_val.  Right now we
      // just can't support this due to default values.
      // TODO: completely get rid of default values (?) or
      // maybe figure out how to implement this. The symptom
      // of not doing this is a normal user will do things like
      // delete the users field of their projects. Not good.
      return (() => {
        const result: any[] = [];
        for (var key in new_val) {
          if (new_val[key] == null) {
            result.push(delete new_val[key]);
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    _user_get_query_changefeed(
      changes: UserQueryChanges,
      table: string,
      primary_keys: string[],
      user_query: AnyRecord,
      where: AnyRecord[],
      json_fields: AnyRecord,
      account_id: string | undefined,
      client_query: AnyRecord,
      orig_table: string,
      cb: CB,
    ) {
      let free_tracker: ((tracker: any) => void) | undefined;
      let left: string[] | undefined;
      let process: (x: AnyRecord) => void;
      let tracker: any;
      const dbg = this._dbg(`_user_get_query_changefeed(table='${table}')`);
      dbg();
      // WARNING: always call changes.cb!  Do not do something like f = changes.cb, then call f!!!!
      // This is because the value of changes.cb may be changed by the caller.
      if (!misc.is_object(changes)) {
        cb("FATAL: changes must be an object with keys id and cb");
        return;
      }
      if (!misc.is_valid_uuid_string(changes.id)) {
        cb("FATAL: changes.id must be a uuid");
        return;
      }
      if (typeof changes.cb !== "function") {
        cb("FATAL: changes.cb must be a function");
        return;
      }
      const changes_cb = changes.cb as CB;
      for (var primary_key of primary_keys) {
        if (
          user_query[primary_key] == null &&
          user_query[primary_key] !== null
        ) {
          cb(
            `FATAL: changefeed MUST include primary key (='${primary_key}') in query`,
          );
          return;
        }
      }
      const watch: string[] = [];
      const select: AnyRecord = {};
      let init_tracker: ((tracker: any) => void) | undefined;
      const possible_time_fields: AnyRecord = misc.deep_copy(json_fields);
      let feed: any;

      const changefeed_keys =
        (left =
          (schema[orig_table] != null
            ? schema[orig_table].changefeed_keys
            : undefined) != null
            ? schema[orig_table] != null
              ? schema[orig_table].changefeed_keys
              : undefined
            : schema[table] != null
              ? schema[table].changefeed_keys
              : undefined) != null
          ? left
          : [];
      for (var field in user_query) {
        var val = user_query[field];
        var type = pg_type(
          __guard__(
            schema[table] != null ? schema[table].fields : undefined,
            (x) => x[field],
          ),
        );
        if (type === "TIMESTAMP") {
          possible_time_fields[field] = "all";
        }
        if (
          val === null &&
          !primary_keys.includes(field) &&
          !changefeed_keys.includes(field)
        ) {
          watch.push(field);
        } else {
          select[field] = type;
        }
      }

      if (misc.len(possible_time_fields) > 0) {
        // Convert (likely) timestamps to Date objects; fill in defaults for inserts
        process = (x) => {
          if (x == null) {
            return;
          }
          if (x.new_val != null) {
            this._user_get_query_json_timestamps(
              x.new_val,
              possible_time_fields,
            );
            if (x.action === "insert") {
              // do not do this for delete or update actions!
              this._user_get_query_set_defaults(
                client_query,
                x.new_val,
                misc.keys(user_query),
              );
            } else if (x.action === "update") {
              this._user_get_query_handle_field_deletes(
                client_query,
                x.new_val,
              );
            }
          }
          if (x.old_val != null) {
            return this._user_get_query_json_timestamps(
              x.old_val,
              possible_time_fields,
            );
          }
        };
      } else {
        process = (x) => {
          if (x == null) {
            return;
          }
          if (x.new_val != null) {
            if (x.action === "insert") {
              // do not do this for delete or update actions!
              return this._user_get_query_set_defaults(
                client_query,
                x.new_val,
                misc.keys(user_query),
              );
            } else if (x.action === "update") {
              return this._user_get_query_handle_field_deletes(
                client_query,
                x.new_val,
              );
            }
          }
        };
      }

      return async.series(
        [
          (cb: CB) => {
            // check for alternative where test for changefeed.
            let tracker_add, tracker_error, tracker_remove;
            let pg_changefeed = __guard__(
              client_query != null ? client_query.get : undefined,
              (x1) => x1.pg_changefeed,
            );
            if (pg_changefeed == null) {
              cb();
              return;
            }

            if (pg_changefeed === "projects") {
              tracker_add = (project_id) => feed?.insert({ project_id });
              tracker_remove = (project_id) => feed?.delete({ project_id });

              // Any tracker error means this changefeed is now broken and
              // has to be recreated.
              tracker_error = () => changes_cb("tracker error - ${err}");

              pg_changefeed = (db, account_id) => {
                return {
                  where: (obj) => {
                    // Check that this is a project we have read access to
                    if (
                      !(db._project_and_user_tracker != null
                        ? db._project_and_user_tracker.get_projects(account_id)[
                            obj.project_id
                          ]
                        : undefined)
                    ) {
                      return false;
                    }
                    // Now check our actual query conditions on the object.
                    // This would normally be done by the changefeed, but since
                    // we are passing in a custom where, we have to do it.
                    if (
                      !this._user_get_query_satisfied_by_obj(
                        user_query,
                        obj,
                        possible_time_fields,
                      )
                    ) {
                      return false;
                    }
                    return true;
                  },

                  select: { project_id: "UUID" },

                  init_tracker: (tracker) => {
                    tracker.on(
                      `add_user_to_project-${account_id}`,
                      tracker_add,
                    );
                    tracker.on(
                      `remove_user_from_project-${account_id}`,
                      tracker_remove,
                    );
                    return tracker.once("error", tracker_error);
                  },

                  free_tracker: (tracker) => {
                    dbg("freeing project tracker events");
                    tracker.removeListener(
                      `add_user_to_project-${account_id}`,
                      tracker_add,
                    );
                    tracker.removeListener(
                      `remove_user_from_project-${account_id}`,
                      tracker_remove,
                    );
                    return tracker.removeListener("error", tracker_error);
                  },
                };
              };
            } else if (pg_changefeed === "news") {
              pg_changefeed = () => ({
                where(obj) {
                  if (obj.date != null) {
                    const date_obj = new Date(obj.date);
                    // we send future news items to the frontend, but filter it based on the server time
                    return date_obj >= misc.months_ago(3);
                  } else {
                    return true;
                  }
                },

                select: { id: "SERIAL UNIQUE", date: "TIMESTAMP" },
              });
            } else if (pg_changefeed === "one-hour") {
              pg_changefeed = () => ({
                where(obj) {
                  if (obj.time != null) {
                    return new Date(obj.time) >= misc.hours_ago(1);
                  } else {
                    return true;
                  }
                },

                select: { id: "UUID", time: "TIMESTAMP" },
              });
            } else if (pg_changefeed === "five-minutes") {
              pg_changefeed = () => ({
                where(obj) {
                  if (obj.time != null) {
                    return new Date(obj.time) >= misc.minutes_ago(5);
                  } else {
                    return true;
                  }
                },

                select: { id: "UUID", time: "TIMESTAMP" },
              });
            } else if (pg_changefeed === "collaborators") {
              if (account_id == null) {
                cb("FATAL: account_id must be given");
                return;
              }
              tracker_add = (collab_id) =>
                feed?.insert({ account_id: collab_id });
              tracker_remove = (collab_id) =>
                feed?.delete({ account_id: collab_id });
              tracker_error = () => changes_cb("tracker error - ${err}");
              pg_changefeed = function (_db, account_id) {
                let shared_tracker: any;
                return {
                  where(obj) {
                    // test of "is a collab with me"
                    return shared_tracker?.get_collabs(account_id)?.[
                      obj.account_id
                    ];
                  },
                  init_tracker: (tracker) => {
                    shared_tracker = tracker;
                    tracker.on(`add_collaborator-${account_id}`, tracker_add);
                    tracker.on(
                      `remove_collaborator-${account_id}`,
                      tracker_remove,
                    );
                    return tracker.once("error", tracker_error);
                  },
                  free_tracker: (tracker) => {
                    dbg("freeing collab tracker events");
                    tracker.removeListener(
                      `add_collaborator-${account_id}`,
                      tracker_add,
                    );
                    tracker.removeListener(
                      `remove_collaborator-${account_id}`,
                      tracker_remove,
                    );
                    return tracker.removeListener("error", tracker_error);
                  },
                };
              };
            }

            const x = pg_changefeed(this, account_id);
            if (x.init_tracker != null) {
              ({ init_tracker } = x);
            }
            if (x.free_tracker != null) {
              ({ free_tracker } = x);
            }
            if (x.select != null) {
              for (var k in x.select) {
                var v = x.select[k];
                select[k] = v;
              }
            }

            if (x.where != null || x.init_tracker != null) {
              ({ where } = x);
              if (account_id == null) {
                cb();
                return;
              }
              // initialize user tracker is needed for where tests...
              return this.project_and_user_tracker({
                cb: async (err, _tracker) => {
                  if (err) {
                    return cb(err);
                  } else {
                    tracker = _tracker;
                    try {
                      await tracker.register(account_id);
                      return cb();
                    } catch (error) {
                      err = error;
                      return cb(err);
                    }
                  }
                },
              });
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            return this.changefeed({
              table,
              select,
              where,
              watch,
              cb: (err, _feed) => {
                // there *is* a glboal variable feed that we set here:
                feed = _feed;
                if (err) {
                  cb(err);
                  return;
                }
                feed.on("change", function (x) {
                  process(x);
                  return changes_cb(undefined, x);
                });
                feed.on("close", function () {
                  changes_cb(undefined, { action: "close" });
                  dbg("feed close");
                  if (tracker != null && free_tracker != null) {
                    dbg("free_tracker");
                    return free_tracker(tracker);
                  } else {
                    return dbg("do NOT free_tracker");
                  }
                });
                feed.on("error", (err) => changes_cb(`feed error - ${err}`));
                this._changefeeds ??= {};
                this._changefeeds[changes.id] = feed;
                if (typeof init_tracker === "function") {
                  init_tracker(tracker);
                }
                return cb();
              },
            });
          },
        ],
        cb,
      );
    }

    user_get_query(opts: UserGetQueryOptions) {
      opts = defaults(opts, {
        account_id: undefined,
        project_id: undefined,
        table: required,
        query: required,
        multi: required,
        options: required, // used for initial query; **IGNORED** by changefeed,
        // which ensures that *something* is sent every n minutes, in case no
        // changes are coming out of the changefeed. This is an additional
        // measure in case the client somehow doesn't get a "this changefeed died" message.
        // Use [{delete:true}] to instead delete the selected records (must
        // have delete:true in schema).
        changes: undefined, // {id:?, cb:?}
        cb: required,
      }); // cb(err, result)
      /*
        The general idea is that user get queries are of the form

            SELECT [columns] FROM table WHERE [get_all] AND [further restrictions] LIMIT/slice

        Using the whitelist rules specified in SCHEMA, we
        determine each of the above, then run the query.

        If no error in query, and changes is a given uuid, set up a change
        feed that calls opts.cb on changes as well.
        */
      const dbg: (..._args: any[]) => void = () => {};
      dbg(
        `account_id='${opts.account_id}', project_id='${opts.project_id}', query=${misc.to_json(opts.query)}, multi=${opts.multi}, options=${misc.to_json(opts.options)}, changes=${misc.to_json(opts.changes)}`,
      );
      const {
        err,
        table,
        client_query,
        require_admin,
        primary_keys = [],
        json_fields = {},
      } = this._parse_get_query_opts(opts);

      if (err) {
        dbg(`error parsing query opts -- ${err}`);
        opts.cb(err);
        return;
      }
      if (client_query == null || table == null) {
        opts.cb("FATAL: invalid get query options");
        return;
      }

      const _query_opts: AnyRecord = {}; // this will be the input to the @_query command.
      const locals: ChangefeedLocals = {};

      return async.series(
        [
          (cb: CB) => {
            if (client_query.get.check_hook != null) {
              dbg("do check hook");
              return client_query.get.check_hook(
                this,
                opts.query,
                opts.account_id,
                opts.project_id,
                cb,
              );
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            if (require_admin) {
              dbg("require admin");
              return this._require_is_admin(opts.account_id, cb);
            } else {
              return cb();
            }
          },
          (cb: CB) => {
            // NOTE: _user_get_query_where may mutate opts.query (for 'null' params)
            // so it is important that this is called before @_user_get_query_query below.
            // See the TODO in userGetQueryFilter.
            dbg("get_query_where");
            return this._user_get_query_where(
              client_query,
              opts.account_id,
              opts.project_id,
              opts.query,
              opts.table,
              (err, where) => {
                _query_opts.where = where;
                return cb(err);
              },
            );
          },
          (cb: CB) => {
            let val;
            if (client_query.get.instead_of_query != null) {
              cb();
              return;
            }
            _query_opts.query = this._user_get_query_query(
              table,
              opts.query,
              client_query.get.remove_from_query,
            );
            const x = this._user_get_query_options(
              opts.options,
              opts.multi,
              client_query.options,
            );
            if (x.err) {
              dbg(`error in get_query_options, ${x.err}`);
              cb(x.err);
              return;
            }
            misc.merge(_query_opts, x);

            const nestloop =
              schema[opts.table] != null
                ? schema[opts.table].pg_nestloop
                : undefined; // true, false or undefined
            if (typeof nestloop === "boolean") {
              val = nestloop ? "on" : "off";
              _query_opts.pg_params = { enable_nestloop: val };
            }

            const indexscan =
              schema[opts.table] != null
                ? schema[opts.table].pg_indexscan
                : undefined; // true, false or undefined
            if (typeof indexscan === "boolean") {
              val = indexscan ? "on" : "off";
              _query_opts.pg_params = { enable_indexscan: val };
            }

            if (opts.changes != null) {
              locals.changes_cb = opts.changes.cb;
              locals.changes_queue = [];
              // see note about why we do the following at the bottom of this file
              opts.changes.cb = (err, obj) =>
                locals.changes_queue?.push({ err, obj });
              dbg("getting changefeed");
              return this._user_get_query_changefeed(
                opts.changes,
                table,
                primary_keys,
                opts.query,
                _query_opts.where,
                json_fields,
                opts.account_id,
                client_query,
                opts.table,
                cb,
              );
            } else {
              return cb();
            }
          },

          (cb: CB) => {
            if (client_query.get.instead_of_query != null) {
              if (opts.changes != null) {
                cb("changefeeds are not supported for querying this table");
                return;
              }
              // Custom version: instead of doing a full query, we instead
              // call a function and that's it.
              dbg("do instead_of_query instead");
              const opts1 = misc.copy_without(opts, ["cb", "changes", "table"]);
              client_query.get.instead_of_query(this, opts1, (err, result) => {
                locals.result = result;
                return cb(err);
              });
              return;
            }

            if (_query_opts.only_changes) {
              dbg("skipping query");
              locals.result = undefined;
              return cb();
            } else {
              dbg("finally doing query");
              return this._user_get_query_do_query(
                _query_opts,
                client_query,
                opts.query,
                opts.multi,
                json_fields,
                (err, result) => {
                  if (err) {
                    cb(err);
                    return;
                  }
                  locals.result = result;
                  return cb();
                },
              );
            }
          },
        ],
        (err) => {
          if (err) {
            dbg(`series failed -- err=${err}`);
            opts.cb(err);
            return;
          }
          dbg("series succeeded");
          opts.cb(undefined, locals.result);
          if (opts.changes != null) {
            dbg("sending change queue");
            if (locals.changes_cb != null) {
              opts.changes.cb = locals.changes_cb;
            }
            //#dbg("sending queued #{JSON.stringify(locals.changes_queue)}")
            return (() => {
              let obj;
              const result: any[] = [];
              for ({ err, obj } of locals.changes_queue ?? []) {
                //#dbg("sending queued changes #{JSON.stringify([err, obj])}")
                result.push(opts.changes.cb?.(err, obj));
              }
              return result;
            })();
          }
        },
      );
    }

    /*
    Synchronized strings
    */
    _user_set_query_syncstring_change_after(
      old_val: AnyRecord,
      new_val: AnyRecord,
      _account_id: string,
      cb: CB,
    ) {
      const dbg = this._dbg("_user_set_query_syncstring_change_after");
      cb(); // return immediately -- stuff below can happen as side effect in the background.
      // Now do the following reactions to this syncstring change in the background:
      // 1. Awaken the relevant project.
      const project_id =
        (old_val != null ? old_val.project_id : undefined) != null
          ? old_val != null
            ? old_val.project_id
            : undefined
          : new_val != null
            ? new_val.project_id
            : undefined;
      if (
        project_id != null &&
        (__guard__(
          new_val != null ? new_val.save : undefined,
          (x) => x.state,
        ) === "requested" ||
          ((new_val != null ? new_val.last_active : undefined) != null &&
            (new_val != null ? new_val.last_active : undefined) !==
              (old_val != null ? old_val.last_active : undefined)))
      ) {
        dbg(`awakening project ${project_id}`);
        return awaken_project(this, project_id);
      }
    }

    // Verify that writing a patch is allowed.
    _user_set_query_patches_check(
      obj: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      // Reject any patch that is too new
      const timeDelta = new Date(obj.time).getTime() - Date.now();
      if (timeDelta > MAX_PATCH_FUTURE_MS) {
        cb("clock"); // this exact error is assumed in synctable!
        return;
      }
      // Write access
      return this._syncstring_access_check(
        obj.string_id,
        account_id,
        project_id,
        cb,
      );
    }

    // Verify that writing a patch is allowed.
    _user_get_query_patches_check(
      obj: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      // Write access (no notion of read only yet -- will be easy to add later)
      return this._syncstring_access_check(
        obj.string_id,
        account_id,
        project_id,
        cb,
      );
    }

    // Verify that writing a patch is allowed.
    _user_set_query_cursors_check(
      obj: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      return this._syncstring_access_check(
        obj.string_id,
        account_id,
        project_id,
        cb,
      );
    }

    // Verify that writing a patch is allowed.
    _user_get_query_cursors_check(
      obj: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      return this._syncstring_access_check(
        obj.string_id,
        account_id,
        project_id,
        cb,
      );
    }

    _syncstring_access_check(
      string_id: string,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      // Check that string_id is the id of a syncstring the given account_id or
      // project_id is allowed to write to.  NOTE: We do not concern ourselves (for now at least)
      // with proof of identity (i.e., one user with full read/write access to a project
      // claiming they are another users of that SAME project), since our security model
      // is that any user of a project can edit anything there.  In particular, the
      // synctable lets any user with write access to the project edit the users field.
      if ((string_id != null ? string_id.length : undefined) !== 40) {
        cb(`FATAL: string_id (='${string_id}') must be a string of length 40`);
        return;
      }
      return this._query({
        query: "SELECT project_id FROM syncstrings",
        where: { "string_id = $::CHAR(40)": string_id },
        cache: false, // *MUST* leave as false (not true), since unfortunately, if this returns no, due to FATAL below this would break opening the file until cache clears.
        cb: one_result("project_id", (err, x) => {
          if (err) {
            return cb(err);
          } else if (!x) {
            // There is no such syncstring with this id -- fail
            return cb("FATAL: no such syncstring");
          } else if (account_id != null) {
            // Attempt to read or write by a user browser client
            return this._require_project_ids_in_groups(
              account_id,
              [x],
              ["owner", "collaborator"],
              cb,
            );
          } else if (project_id != null) {
            // Attempt to read or write by a *project*
            if (project_id === x) {
              return cb();
            } else {
              return cb(
                "FATAL: project not allowed to write to syncstring in different project",
              );
            }
          }
        }),
      });
    }

    // Check permissions for querying for syncstrings in a project
    async _syncstrings_check(
      obj: AnyRecord,
      account_id: string | undefined,
      project_id: string | undefined,
      cb: CB,
    ) {
      //dbg = @dbg("_syncstrings_check")
      //dbg(misc.to_json([obj, account_id, project_id]))
      if (
        !misc.is_valid_uuid_string(obj != null ? obj.project_id : undefined)
      ) {
        cb(
          `FATAL: project_id (='${obj != null ? obj.project_id : undefined}') must be a valid uuid`,
        );
        return;
      }
      if (project_id != null) {
        if (project_id === obj.project_id) {
          // The project can access its own syncstrings
          cb();
        } else {
          cb("FATAL: projects can only access their own syncstrings"); // for now at least!
        }
        return;
      }
      if (account_id != null) {
        // Access request by a client user
        return this._require_project_ids_in_groups(
          account_id,
          [obj.project_id],
          ["owner", "collaborator"],
          cb,
        );
      } else {
        return cb("FATAL: only users and projects can access syncstrings");
      }
    }

    // Other functions that are needed to implement various use queries,
    // e.g., for virtual queries like file_use_times.
    // ASYNC FUNCTION with no callback.
    async updateRetentionData(opts: RetentionOptions) {
      return await updateRetentionData(opts);
    }
  };
}

const _last_awaken_time: Record<string, Date> = {};
var awaken_project = function (db: any, project_id: string, cb?: CB) {
  // throttle so that this gets called *for a given project* at most once every 30s.
  const now = new Date();
  if (
    _last_awaken_time[project_id] != null &&
    now.getTime() - _last_awaken_time[project_id].getTime() < 30000
  ) {
    return;
  }
  _last_awaken_time[project_id] = now;
  const dbg = db._dbg(`_awaken_project(project_id=${project_id})`);
  if (db.projectControl == null) {
    dbg("skipping since no projectControl defined");
    return;
  }
  dbg("doing it...");
  return async.series(
    [
      async function (cb: CB) {
        try {
          const project: ProjectControl = await db.projectControl(project_id);
          await project.start();
          return cb();
        } catch (err) {
          return cb(`error starting project = ${err}`);
        }
      },
      function (cb: CB) {
        if (db.ensure_connection_to_project == null) {
          cb();
          return;
        }
        dbg("also make sure there is a connection from hub to project");
        // This is so the project can find out that the user wants to save a file (etc.)
        return db.ensure_connection_to_project(project_id, cb);
      },
    ],
    function (err) {
      if (err) {
        dbg(`awaken project error -- ${err}`);
      } else {
        dbg("success awakening project");
      }
      return typeof cb === "function" ? cb(err) : undefined;
    },
  );
};
/*
Note about opts.changes.cb:

Regarding sync, what was happening I think is:
 - (a) https://github.com/sagemathinc/cocalc/blob/master/src/packages/hub/postgres-user-queries.coffee#L1384 starts sending changes
 - (b) https://github.com/sagemathinc/cocalc/blob/master/src/packages/hub/postgres-user-queries.coffee#L1393 sends the full table.

(a) could result in changes actually getting to the client before the table itself has been initialized.  The client code assumes that it only gets changes *after* the table is initialized.  The browser client seems to be smart enough that it detects this situation and resets itself, so the browser never gets messed up as a result.
However, the project definitely does NOT do so well, and it can get messed up.  Then it has a broken version of the table, missing some last minute change.    It is broken until the project forgets about that table entirely, which is can be a pretty long time (or project restart).

My fix is to queue up those changes on the server, then only start sending them to the client **after** the (b) query is done.  I tested this by using setTimeout to manually delay (b) for a few seconds, and fully seeing the "file won't save problem".   The other approach would make it so clients are more robust against getting changes first.  However, it would take a long time for all clients to update (restart all projects), and it's an annoying assumption to make in general -- we may have entirely new clients later and they could make the same bad assumptions about order...
*/

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
