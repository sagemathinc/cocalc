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
  virtual?: string; // Must be another table name
  pg_indexes?: any[];
  user_query?: {
    get?: {
      fields: { [key in keyof Partial<F>]: any };
      throttle_changes?: number;
      pg_where?: string[] | { [key: string]: string }[];
      options?: any; // [{ limit: 1 }]
      instead_of_query?: (
        database,
        obj,
        instead_of_query,
        cb: Function
      ) => void;
    };
    set?: {
      fields: { [key in keyof Partial<F>]: any };
      check_hook?: (
        database,
        obj,
        account_id: string,
        project_id: string,
        cb: Function
      ) => void;
      // hook to note that project is being used (CRITICAL: do not pass path
      // into db.touch since that would cause another write to the file_use table!)
      // CRITICAL: Only do this if what edit or chat for this user is very recent.
      // Otherwise we touch the project just for seeing notifications or opening
      // the file, which is confusing and wastes a lot of resources.
      instead_of_change?: (
        database,
        old_val,
        new_val,
        account_id: string,
        cb: Function
      ) => void;
    };
  };
}

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
type PartialSchema<F extends Fields> = Omit<TableSchema<F>, "fields">;
