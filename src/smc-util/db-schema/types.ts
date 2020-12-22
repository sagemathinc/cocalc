/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
    if (fields == null || rules.primary_key == null) {
      throw Error(
        "db-schema error; fields and primary_key must be set for non-virtual tables"
      );
    }
  }
  const T: TableSchema<F> = { ...rules, fields };
  SCHEMA[name] = T;
}

export interface DBSchema {
  [key: string]: TableSchema<any>;
}

interface Fields {
  [key: string]:
    | boolean
    | {
        type:
          | "uuid"
          | "timestamp"
          | "string"
          | "boolean"
          | "map"
          | "array"
          | "integer"
          | "number"
          | "Buffer";
        desc?: string;
        pg_type?: string;
        unique?: boolean;
      };
}

interface UserOrProjectQuery<F extends Fields> {
  get?: {
    fields: { [key in keyof Partial<F>]: any };
    throttle_changes?: number;
    pg_where?:
      | string[]
      | { [key: string]: string }[]
      | { [key: string]: string[] }[];
    pg_where_load?: string[] | { [key: string]: string }[]; // used instead of pg_where if server is under "heavy load"
    pg_changefeed?: string;
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
      cb: (err?: string | Error, result?: any) => void
    ) => void;
    check_hook?: (
      database,
      query,
      account_id: string,
      project_id: string,
      cb: (err?: string | Error) => void
    ) => void;
  };
  set?: {
    fields: { [key in keyof Partial<F>]: any };
    required_fields?: { [key in keyof Partial<F>]: any };
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
      cb: (err?: string | Error) => void
    ) => void;

    /**
     * 1. BEFORE: If before_change is set, it is called with input
     *   (database, old_val, query, account_id, cb)
     * before the actual change to the database is made.
     */
    before_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error) => void
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
     */
    instead_of_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error, result?: any) => void
    ) => void;

    /**
     * 3. AFTER:  If set, the on_change is called with
     *   (database, old_val, query, account_id, cb)
     * after everything the database has been modified.
     */
    on_change?: (
      database,
      old_val,
      query,
      account_id: string,
      cb: (err?: string | Error) => void
    ) => void;

    /* 4. instead_of_query */
    instead_of_query?: (
      database,
      opts: {
        query: any;
        options: any[];
      },
      cb: (err?: string | Error) => void
    ) => void;
  };
}

interface TableSchema<F extends Fields> {
  desc?: string;
  primary_key?: keyof F | (keyof F)[]; // One of the fields or array of fields; NOTE: should be required if virtual is not set.
  fields?: F; // the fields -- required if virtual is not set.
  db_standby?: "unsafe" | "safer";
  pg_nestloop?: boolean; // default is whatever the database has set (usually "on")
  pg_indexscan?: boolean; // --*--
  priority?: number; // 0 to 9, for bottleneck
  durability?: "soft" | "hard" | "ephemeral"; // Default is hard; soft is ??; ephemeral doesn't even involve the database (just used to specify SyncTable structure).
  unique_writes?: boolean; // If true, assume no reason for a user to write the same record twice.
  anonymous?: boolean;
  virtual?: string | true; // Must be another table name or true
  pg_indexes?: any[];
  user_query?: UserOrProjectQuery<F>;
  project_query?: UserOrProjectQuery<F>;
}

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
type PartialSchema<F extends Fields> = Omit<TableSchema<F>, "fields">;

import { SiteSettings } from "./site-defaults";
import { SettingsExtras } from "./site-settings-extras";

// what will come out of the database and (if available) sending it through `to_val`
export type AllSiteSettings = {
  [key in keyof SiteSettings | keyof SettingsExtras]?: any;
};

export type RegistrationTokenSetFields =
  | "token"
  | "descr"
  | "expires"
  | "limit"
  | "disabled";

export type RegistrationTokenGetFields = RegistrationTokenSetFields | "counter";
