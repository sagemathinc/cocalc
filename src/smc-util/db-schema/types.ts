export function create<F extends Fields>({
  rules,
  fields
}: {
  fields: F;
  rules: PartialSchema<F>;
}): TableSchema<F> {
  return { ...rules, fields };
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
          | "integer";
        desc: string;
        pg_type?: string;
        unique?: boolean;
      };
}

interface TableSchema<F extends Fields> {
  desc: string;
  primary_key: keyof F | (keyof F)[]; // One of the fields or array of fields
  fields: F;
  db_standby?: "unsafe" | "safer";
  durability?: "soft" | "hard"; // Default is hard
  anonymous?: boolean;
  virtual?: string | true; // Must be another table name or true
  pg_indexes?: any[];
  user_query?: {
    get?: {
      fields: { [key in keyof Partial<F>]: any };
      throttle_changes?: number;
      pg_where?: string[] | { [key: string]: string }[];
      admin?: boolean;
      options?: any; // [{ limit: 1 }]
      instead_of_query?: (
        database,
        obj,
        instead_of_query,
        cb: Function
      ) => void;
      check_hook?: (
        database,
        query,
        account_id: string,
        project_id: string,
        cb: Function
      ) => void;
    };
    set?: {
      fields: { [key in keyof Partial<F>]: any };
      admin?: boolean;
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
        cb: Function
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
        cb: Function
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
        cb: Function
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
        cb: Function
      ) => void;
    };
  };
}

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
type PartialSchema<F extends Fields> = Omit<TableSchema<F>, "fields">;

import { SiteSettings } from "./site-defaults";
import { SettingsExtras } from "./site-settings-extras";

// what will come out of the database and (if available) sending it through `to_val`
export type AllSiteSettings = Partial<
  {
    [key in keyof SiteSettings & keyof SettingsExtras]: any;
  }
>;
