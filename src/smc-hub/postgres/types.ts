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

type CB = (err: string | Error, result: any) => any;

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

  account_ids_to_usernames(opts: { account_ids: string[]; cb: Function }): void;

  get_project(opts: {
    project_id: string;
    columns?: string[];
    cb: Function;
  }): void;

  get_account(opts: {
    account_id: string;
    columns?: string[];
    cb: Function;
  }): void;

  add_user_to_project(opts: {
    account_id: string;
    project_id: string;
    group?: string;
    cb: Function;
  }): void;

  user_is_in_project_group(opts: {
    account_id: string;
    project_id: string;
    group?: string[];
    cache?: boolean;
    cb: Function;
  }): void;

  get_user_column(column: string, account_id: string, cb: Function);

  _get_project_column(column: string, project_id: string, cb: Function);

  do_account_creation_actions(opts: {
    email_address: string;
    account_id: string;
    cb: Function;
  }): void;

  mark_account_deleted(opts: {
    email_address: string;
    account_id: string;
    cb: Function;
  }): void;

  count_accounts_created_by(opts: {
    ip_address: string;
    age_s: number;
    cb: Function;
  }): void;

  account_exists(opts: { email_address: string; cb: Function }): void;

  is_banned_user(opts: {
    email_address?: string;
    account_id?: string;
    cb: Function;
  }): void;

  get_server_setting(opts: { name: string; cb: Function }): void;
  get_server_settings_cached(opts: { cb: CB }): void;

  create_account(opts: {
    first_name: string;
    last_name: string;
    created_by?: string;
    email_address?: string;
    password_hash?: string;
    passport_strategy?: any;
    passport_id?: string;
    passport_profile?: any;
    usage_intent?: string;
    cb: Function;
  }): void;

  log(opts: { event: string; value: any; cb?: Function }): void;

  user_is_in_group(opts: {
    account_id: string;
    group: string;
    cb: Function;
  }): void;

  sha1(...args): string;

  get_project_ids_with_user(opts: {
    account_id: string;
    is_owner?: boolean;
    cb: Function;
  }): void;

  get_remember_me(opts: { hash: string; cb: Function });
  save_remember_me(opts: {
    account_id: string;
    hash: string;
    value: string;
    ttl: number;
    cb: Function;
  });

  passport_exists(opts: { strategy: string; id: string; cb: Function });
  create_passport(opts: {
    account_id: string;
    strategy: string;
    id: string;
    profile: any; // complex object
    email_address?: string;
    first_name?: string;
    last_name?: string;
    cb: Function;
  });
  get_passport_settings(opts: { strategy: string; cb: Function });
  get_all_passport_settings(opts: { cb: Function });

  change_password(opts: {
    account_id: string;
    password_hash: string;
    invalidate_remember_me?: boolean;
    cb: Function;
  });
}
