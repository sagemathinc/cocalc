/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { Client } from "pg";

import { PassportStrategyDB } from "@cocalc/database/settings/auth-sso-types";
import { ProjectState, ProjectStatus } from "@cocalc/util/db-schema/projects";
import {
  CB,
  CBDB,
  QueryResult,
  QueryRows,
  UntypedQueryResult,
} from "@cocalc/util/types/database";
import { Changes } from "./changefeed";

export type { QueryResult };

export type QuerySelect = object;

export type QueryWhere =
  | { [field: string]: any }
  | { [field: string]: any }[]
  | string
  | string[];

// There are many more options still -- add them as needed.
export interface QueryOptions<T = UntypedQueryResult> {
  select?: string | string[];
  table?: string;
  where?: QueryWhere;
  query?: string;
  set?: { [key: string]: any };
  params?: any[];
  values?: { [key: string]: any };
  order_by?: string;
  jsonb_set?: object;
  jsonb_merge?: object;
  cache?: boolean;
  retry_until_success?: any; // todo
  offset?: number;
  limit?: number;
  timeout_s?: number;
  conflict?: string;
  cb?: CB<QueryRows<T>>;
}

export interface AsyncQueryOptions<T = UntypedQueryResult>
  extends Omit<QueryOptions<T>, "cb"> {}

export interface UserQueryOptions {
  client_id?: string; // if given, uses to control number of queries at once by one client.
  priority?: number; // (NOT IMPLEMENTED) priority for this query (an integer [-10,...,19] like in UNIX)
  account_id?: string;
  project_id?: string;
  query?: object;
  options?: object[];
  changes?: undefined; // id of change feed
  cb?: CB<{ action?: "close" }>;
}

export interface ChangefeedOptions {
  table: string; // Name of the table
  select: { [field: string]: any }; // Map from field names to postgres data types. These must
  // determine entries of table (e.g., primary key).
  where: QueryWhere; // Condition involving only the fields in select; or function taking
  // obj with select and returning true or false
  watch: string[]; // Array of field names we watch for changes
  cb: CB;
}

export interface DeletePassportOpts {
  account_id: string;
  strategy: string; // our name of the strategy
  id: string;
}

export interface PassportExistsOpts {
  strategy: string;
  id: string;
  cb?: CB;
}

export interface CreatePassportOpts {
  account_id: string;
  strategy: string; // our name of the strategy
  id: string;
  profile: any; // complex object
  email_address?: string;
  first_name?: string;
  last_name?: string;
  cb?: CB;
}

export interface UpdateAccountInfoAndPassportOpts {
  account_id: string;
  first_name?: string;
  last_name?: string;
  strategy: string; // our name of the strategy
  id: string;
  profile: any;
  passport_profile: any;
}

export interface PostgreSQL extends EventEmitter {
  _dbg(desc: string): Function;

  _stop_listening(table: string, select: QuerySelect, watch: string[]);

  _query(opts: QueryOptions): void;

  user_query(opts: UserQueryOptions): void;

  _client(): Client | undefined;
  _clients: Client[] | undefined;

  is_standby: boolean;

  get_site_settings(opts: { cb: CB }): void;

  async_query<T = UntypedQueryResult>(
    opts: AsyncQueryOptions,
  ): Promise<QueryRows<T>>;

  _listen(table: string, select: QuerySelect, watch: string[], cb: CB): void;

  changefeed(opts: ChangefeedOptions): Changes;

  account_ids_to_usernames(opts: { account_ids: string[]; cb: CB }): void;

  get_project(opts: { project_id: string; columns?: string[]; cb: CB }): void;

  get_account(opts: {
    account_id?: string;
    email_address?: string;
    columns?: string[];
    cb: CBDB;
  }): void;

  add_user_to_project(opts: {
    account_id: string;
    project_id: string;
    group?: string;
    cb: CB;
  }): void;

  remove_user_from_project(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  }): void;

  user_is_in_project_group(opts: {
    account_id: string;
    project_id: string;
    group?: string[];
    cache?: boolean;
    cb: CB;
  }): void;

  user_is_collaborator(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  });

  get_user_column(column: string, account_id: string, cb: CB);

  _get_project_column(column: string, project_id: string, cb: CB);

  do_account_creation_actions(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  mark_account_deleted(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  count_accounts_created_by(opts: {
    ip_address: string;
    age_s: number;
    cb: CB;
  }): void;

  account_exists(opts: { email_address: string; cb: CB }): void;

  is_banned_user(opts: {
    email_address?: string;
    account_id?: string;
    cb: CB;
  }): void;

  get_server_setting(opts: { name: string; cb: CB }): void;
  get_server_settings_cached(opts: { cb: CB }): void;
  set_server_setting(opts: { name: string; value: string; cb: CB }): void;
  server_settings_synctable(): any; // returns a table

  create_sso_account(opts: {
    first_name?: string; // invalid name will throw Error
    last_name?: string; // invalid name will throw Error
    created_by?: string;
    email_address?: string;
    password_hash?: string;
    passport_strategy: any;
    passport_id: string;
    passport_profile: any;
    usage_intent?: string;
    cb: CB;
  }): void;

  make_user_admin(opts: {
    account_id?: string;
    email_address?: string;
    cb: CB;
  });

  log(opts: { event: string; value: any; cb?: Function }): void;

  user_is_in_group(opts: { account_id: string; group: string; cb: CB }): void;

  sha1(...args): string;

  get_project_ids_with_user(opts: {
    account_id: string;
    is_owner?: boolean;
    cb: CBDB;
  }): void;

  get_remember_me(opts: { hash: string; cb: CB });

  passport_exists(opts: PassportExistsOpts): Promise<string | undefined>;

  create_passport(opts: CreatePassportOpts): Promise<string>;

  delete_passport(opts: DeletePassportOpts): Promise<void>;

  set_passport_settings(
    db: PostgreSQL,
    opts: PassportStrategyDB & { cb?: CB },
  ): Promise<void>;

  get_passport_settings(opts: {
    strategy: string;
    cb?: CB;
  }): Promise<PassportStrategyDB>;
  get_all_passport_settings(): Promise<PassportStrategyDB[]>;
  get_all_passport_settings_cached(): Promise<PassportStrategyDB[]>;

  update_account_and_passport(
    opts: UpdateAccountInfoAndPassportOpts,
  ): Promise<void>;

  change_password(opts: {
    account_id: string;
    password_hash: string;
    invalidate_remember_me?: boolean;
    cb: CB;
  });
  change_email_address(opts: {
    account_id: string;
    email_address: string;
    cb: CB;
  }): void;
  verify_email_check_token(opts: { email_address: string; token: string });
  reset_server_settings_cache(): void;

  update_coupon_history(opts: {
    account_id: string;
    coupon_history;
    cb: CB;
  }): void;

  get_coupon_history(opts: { account_id: string; cb: CB }): void;

  get_user_project_upgrades(opts: { account_id: string; cb: CB }): void;

  remove_all_user_project_upgrades(opts: {
    account_id: string;
    projects: string[];
    cb: CB;
  }): void;

  _concurrent_warn: number;

  concurrent(): number;

  register_hub(opts: {
    host: string;
    port: number;
    clients: number;
    ttl: number;
    cb: CB;
  }): void;

  synctable(opts: {
    table: string;
    columns?: string[];
    where?: { [key: string]: string | string[] } | string;
    limit?: number;
    order_by?: any;
    where_function?: Function;
    idle_timeout_s?: number;
    cb?: CB;
  });

  projects_that_need_to_be_started(): Promise<string[]>;

  is_connected(): boolean;

  verify_email_create_token(opts: {
    account_id: string;
    cb: CB<{
      token: string;
      email_address: string;
    }>;
  }): Promise<void>;

  user_query_cancel_changefeed(opts: { id: any; cb?: CB }): void;

  save_blob(opts: {
    uuid: string;
    blob?: Buffer;
    ttl?: number;
    project_id?: string;
    cb: CB;
  }): void;

  set_project_state(opts: {
    project_id: string;
    state: ProjectState;
    time?: Date;
    error?: any;
    ip?: string;
    cb: CB;
  }): void;

  set_project_status(opts: { project_id: string; status: ProjectStatus }): void;

  touch(opts: {
    project_id?: string;
    account_id: string;
    action?: string;
    path?: string;
    cb: CB;
  });

  get_project_extra_env(opts: { project_id: string; cb: CB }): void;

  projectControl?: (project_id: string) => Project;

  ensure_connection_to_project?: (project_id: string, cb?: CB) => Promise<void>;

  get_blob(opts: {
    uuid: string;
    save_in_db?: boolean;
    touch?: boolean;
    cb: CB;
  }): void;

  import_patches(opts: { patches: string[]; string_id?: string; cb?: CB });
  delete_blob(opts: { uuid: string; cb?: CB });

  adminAlert?: (opts: {
    subject: string;
    body?: string;
  }) => Promise<number | undefined>;

  archivePatches(opts: {
    string_id: string;
    compress?: string;
    level?: number;
    cutoff?: Date;
    cb?: CB;
  });

  when_sent_project_invite(opts: { project_id: string; to: string; cb?: CB });

  sent_project_invite(opts: {
    project_id: string;
    to: string;
    error?: string;
    cb?: CB;
  });

  account_creation_actions(opts: {
    email_address: string;
    action?: any;
    ttl?: number;
    cb: CB;
  });

  log_client_error(opts: {
    event: string;
    error: string;
    account_id?: string;
    cb?: CB;
  });

  webapp_error(opts: object);

  set_project_settings(opts: { project_id: string; settings: object; cb?: CB });
}

// This is an extension of BaseProject in projects/control/base.ts
type Project = EventEmitter & {};
