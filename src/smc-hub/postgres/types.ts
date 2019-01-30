import { EventEmitter } from "events";
import { Changes } from "./changefeed";

export type QuerySelect = object;

export type QueryWhere =
  | { [field: string]: any }
  | { [field: string]: any }[]
  | string
  | string[];

// There are many more options still -- add them as needed.
export interface QueryOptions {
  select?: string | string[];
  table?: string;
  where?: QueryWhere;
  query?: string;
  params?: string[];
  cb?: Function;
}

export type QueryResult = { [key: string]: any };

export interface ChangefeedOptions {
  table: string; // Name of the table
  select: { [field: string]: any }; // Map from field names to postgres data types. These must
  // determine entries of table (e.g., primary key).
  where: QueryWhere; // Condition involving only the fields in select; or function taking
  // obj with select and returning true or false
  watch: string[]; // Array of field names we watch for changes

  cb: Function;
}

export interface PostgreSQL extends EventEmitter {
  _dbg(desc: string): Function;
  _stop_listening(table: string, select: QuerySelect, watch: string[]);
  _query(opts: QueryOptions): void;
  _listen(
    table: string,
    select: QuerySelect,
    watch: string[],
    cb: Function
  ): void;
  changefeed(opts: ChangefeedOptions): Changes;
}
