import { EventEmitter } from "events";

export type QuerySelect = object;

export type QueryWhere =
  | { [field: string]: any }
  | { [field: string]: any }[]
  | string
  | string[];

export interface PostgreSQL extends EventEmitter {
  _dbg(desc: string): Function;
  _stop_listening(table: string, select: QuerySelect, watch: string[]);
  _query(opts: {
    select: string | string[];
    table: string;
    where: QueryWhere;
    cb: Function;
  }): void;
  _listen(
    table: string,
    select: QuerySelect,
    watch: string[],
    cb: Function
  ): void;
}
