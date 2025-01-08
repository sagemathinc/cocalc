/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The schema below determines the PostgreSQL database schema.   The notation is as follows:

schema.table_name =
    desc: 'A description of this table.'   # will be used only for tooling
    primary_key : 'the_table_primary_key'
    durability :  'hard' or 'soft' # optional -- if given, specify the table durability; 'hard' is the default
    fields :   # every field *must* be listed here or user queries won't work.
        the_table_primary_key :
            type : 'uuid'
            desc : 'This is the primary key of the table.'
        ...
    pg_indexes : [array of column names]  # also some more complicated ways to define indexes; see the examples.
    user_query :  # queries that are directly exposed to the client via a friendly "fill in what result looks like" query language
        get :     # describes get query for reading data from this table
            pg_where :  # this gets run first on the table before
                      'account_id' - replaced by user's account_id
                      'project_id' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be a project that user has read access to)
                      'project_id-public' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be of a project with at east one public path)
                      'all_projects_read' - filled in with list of all the id's of projects this user has read access to
                      'collaborators' - filled in by account_id's of all collaborators of this user
                      an arbitrary function -  gets called with an object with these keys:
                             account_id, table, query, multi, options, changes
            fields :  # these are the fields any user is allowed to see, subject to the all constraint above
                field_name    : either null or a default_value
                another_field : 10   # means will default to 10 if undefined in database
                this_field    : null # no default filled in
                settings :
                     strip : false   # defaults for a field that is an object -- these get filled in if missing in db
                     wrap  : true
        set :     # describes more dangerous *set* queries that the user can make via the query language
            pg_where :   # initially restrict what user can set
                'account_id' - user account_id
                      - list of project_id's that the user has write access to
            fields :    # user must always give the primary key in set queries
                account_id : 'account_id'  # means that this field will automatically be filled in with account_id
                project_id : 'project_write' # means that this field *must* be a project_id that the user has *write* access to
                foo : true   # user is allowed (but not required) to set this
                bar : true   # means user is allowed to set this

To specify more than one user query against a table, make a new table as above, omitting
everything except the user_query section, and include a virtual section listing the actual
table to query:

    virtual : 'original_table'

For example,

schema.collaborators =
    primary_key : 'account_id'
    anonymous   : false
    virtual     : 'accounts'
    user_query:
        get : ...


Finally, putting

    anonymous : true

makes it so non-signed-in-users may query the table (read only) for data, e.g.,

schema.stats =
    primary_key: 'id'
    anonymous : true   # allow user access, even if not signed in
    fields:
        id                  : true
        ...

*/

import { RenderSpec } from "./render-types";

export const SCHEMA: DBSchema = {};

export function Table<F extends Fields>({
  name,
  rules,
  fields,
}: {
  name: string;
  fields?: F;
  rules: PartialSchema<F>;
}): void {
  if (!rules.virtual) {
    // runtime check that fields and primary_key are set.
    // If there is a way to do this at compile time with typescript, that would be better.
    if (fields == null) {
      throw Error("db-schema error; fields must be set for non-virtual tables");
    }
    if (rules.primary_key == null) {
      throw Error(
        "db-schema error; primary_key must be set for non-virtual tables",
      );
    }
  }
  const T: TableSchema<F> = { name, ...rules, fields };
  SCHEMA[name] = T;

  if (name.startsWith("crm_")) {
    // some special rules for all crm tables, just in case we figure to put them in manually.
    if (T.user_query?.get != null) {
      T.user_query.get.admin = true;
      T.user_query.get.allow_field_deletes = true; // safe for all crm tables, due to them not having defaults.  Also, really useful, e.g., "clear a due date".
    }
    if (T.user_query?.set != null) {
      T.user_query.set.admin = true;
      T.user_query.set.allow_field_deletes = true; // same comment as above for get.
    }
  }
}

export interface DBSchema {
  [key: string]: TableSchema<any>;
}

type FieldType =
  | "uuid"
  | "timestamp"
  | "string"
  | "boolean"
  | "map"
  | "array"
  | "integer"
  | "number"
  | "Buffer";

export interface FieldSpec {
  type: FieldType;
  desc?: string;
  title?: string;
  pg_type?: string;
  unique?: boolean;
  noCoerce?: boolean; // if true, don't coerce to this type when doing set query
  render?: RenderSpec;
}

export interface Fields {
  [key: string]:
    | true // this is set ONLY for fields in virtual tables and means refer to the actual table.
    | FieldSpec;
}

type PgWhere =
  | (string | { [key: string]: any })[]
  | ((obj: any, db: any) => any[]);

export interface UserOrProjectQuery<F extends Fields> {
  get?: {
    fields: { [key in keyof Partial<F>]: any };
    required_fields?: { [key in keyof Partial<F>]: any };
    throttle_changes?: number;
    allow_field_deletes?: boolean; // if true, allow deleting of field in record to be reported.  Do NOT do this if there are any default values (e.g., the projects and accounts tables have default values), since it's just not implemented yet!  This *is* used by all the crm tables.
    pg_where?: PgWhere;
    pg_where_load?: (string | { [key: string]: any })[]; // used instead of pg_where if server is under "heavy load"
    pg_changefeed?: string | Function;
    remove_from_query?: string[];
    admin?: boolean;
    options?: any; // [{ limit: 1 }]
    options_load?: any; // used instead of options if server is under "heavy load"
    instead_of_query?: (
      database,
      opts: {
        account_id?: string;
        project_id?: string;
        query: any;
        multi: boolean;
        options: any[];
      },
      cb: (err?: string | Error, result?: any) => void,
    ) => void;
    check_hook?: (
      database,
      query,
      account_id: string,
      project_id: string,
      cb: (err?: string | Error) => void,
    ) => void;
  };
  set?: {
    fields: { [key in keyof Partial<F>]: any };
    required_fields?: { [key in keyof Partial<F>]: any };
    allow_field_deletes?: boolean; // if true, allow setting a field to null to delete it.  This *is* used by all the crm tables.  It's off by default due to not being supported for tables with default values.  If this is not true then in set queries when a field is being set to undefined or null, that is just ignored.
    admin?: boolean;
    // if true, it is possible to delete records from
    // this table (use options=[{delete:true}] in the query)
    delete?: boolean;
    // HOOKS which allow for running arbitrary code in response to
    // user set queries.  In each case below, query is QUERY, only the part
    // of the object that the user requested to change.
    // ie: client_call(query: {[db_table_name]: QUERY})
    //
    // old_val is the matching result from QUERY that will be replaced

    options?: { delete: true }[];
    /**
     * 0. CHECK: Runs before doing any further processing; has callback, so this
     * provides a generic way to quickly check whether or not this query is allowed
     * for things that can't be done declaratively.  The check_hook can also
     * mutate the obj (the user query), e.g., to enforce limits on input size.
     */
    check_hook?: (
      database,
      query,
      account_id: string,
      project_id: string,
      cb: (err?: string | Error) => void,
    ) => void;

    /**
     * 1. BEFORE: If before_change is set, it is called with input
     *   (database, old_val, query, account_id, cb)
     * before the actual change to the database is made.
     * If cb(err) then no change is made and error is reported.
     # If cb(undefined, true) then no change is made and no error; any work is considered done.
     #
     # NOTE: old_val can be null if no primary key is specified, e.g., when creating a new object.
     */
    before_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error) => void,
    ) => void;

    // hook to note that project is being used (CRITICAL: do not pass path
    // into db.touch since that would cause another write to the file_use table!)
    /**
     * 2. INSTEAD OF: If instead_of_change is set, then it is called with input
     *      (database, old_val, query, account_id, cb)
     * *instead* of actually doing the update/insert to
     * the database.  This makes it possible to run arbitrary
     * code whenever the user does a certain type of set query.
     * Obviously, if that code doesn't set the query in the
     * database, then query won't be the new val.
     *
     * NOTE: old_val can be null if no primary key is specified, e.g., when creating a new object.
     */
    instead_of_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error, result?: any) => void,
    ) => void;

    /**
     * 3. AFTER:  If set, the on_change is called with
     *   (database, old_val, query, account_id, cb)
     * after everything the database has been modified.
     *
     * NOTE: old_val can be null if no primary key is specified, e.g., when creating a new object.
     */
    on_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error) => void,
    ) => void;

    /* 4. instead_of_query */
    instead_of_query?: (
      database,
      opts: {
        query: any;
        options: any[];
      },
      cb: (err?: string | Error) => void,
    ) => void;
  };
}

export interface TableSchema<F extends Fields> {
  name: string;
  desc?: string;

  // One of the fields or array of fields; NOTE: should be required if virtual is not set.
  primary_key?: keyof F | (keyof F)[];

  // Optional keys to also include in the select clause when creating changefeed.  Needed, e.g., when using a serial primary key.
  changefeed_keys?: (keyof F)[];

  // this is only used when migrating when we *add* a new primary key as primary key for the schema for a table (e.g., for listings)
  default_primary_key_value?: { [key: string]: any };

  fields?: F; // the fields -- required if virtual is not set.
  db_standby?: "unsafe" | "safer";
  pg_nestloop?: boolean; // default is whatever the database has set (usually "on")
  pg_indexscan?: boolean; // --*--
  durability?: "soft" | "hard" | "ephemeral"; // Default is hard; soft is ??; ephemeral doesn't even involve the database (just used to specify SyncTable structure).
  unique_writes?: boolean; // If true, assume no reason for a user to write the same record twice.
  anonymous?: boolean;
  virtual?: string | true; // Must be another table name or true
  external?: boolean; // if true, this is an external table, so do not sync the schema
  pg_indexes?: string[];
  pg_unique_indexes?: string[];
  crm_indexes?: string[]; // pg_indexes are not used by the CRM data; you must specify any indexing of the CRM data explicitly here
  user_query?: UserOrProjectQuery<F>;
  project_query?: UserOrProjectQuery<F>;
}

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
type PartialSchema<F extends Fields> = Omit<TableSchema<F>, "fields" | "name">;

import { SiteSettings, SiteSettingsKeys } from "./site-defaults";
import { SettingsExtras, SiteSettingsExtrasKeys } from "./site-settings-extras";

// what will come out of the database and (if available) sending it through `to_val`
export type AllSiteSettings = {
  [key in keyof SiteSettings | keyof SettingsExtras]?: any;
};

export type AllSiteSettingsCached = AllSiteSettings & { _timestamp?: number };

export type RegistrationTokenSetFields =
  | "token"
  | "descr"
  | "expires"
  | "limit"
  | "disabled";

export type RegistrationTokenGetFields = RegistrationTokenSetFields | "counter";

export type AllSiteSettingsKeys = SiteSettingsKeys | SiteSettingsExtrasKeys;
