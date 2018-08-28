/*
Typescript async/await rewrite of smc-util/client.coffee...
*/

const webapp_client = require("smc-webapp/webapp_client").webapp_client;
const schema = require("smc-util/schema");
const DEFAULT_FONT_SIZE: number = require("smc-util/db-schema")
  .DEFAULT_FONT_SIZE;
import { redux } from "../../app-framework";
import { callback_opts } from "./async-utils";
import { FakeSyncstring } from "./syncstring-fake";
import { Map } from "immutable";

export function server_time(): Date {
  return webapp_client.server_time();
}

interface ExecOpts {
  project_id: string;
  path?: string;
  command: string;
  args?: string[];
  timeout?: number;
  network_timeout?: number;
  max_output?: number;
  bash?: boolean;
  aggregate?: string | number | { value: string | number };
  err_on_exit?: boolean;
  allow_post?: boolean; // set to false if genuinely could take a long time
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  time: number; // time in ms, from user point of view.
}

// async version of the webapp_client exec -- let's you run any code in a project!
export async function exec(opts: ExecOpts): Promise<ExecOutput> {
  return callback_opts(webapp_client.exec)(opts);
}

interface ReadTextFileOpts {
  project_id: string;
  path: string;
  timeout?: number;
}

export async function read_text_file_from_project(
  opts: ReadTextFileOpts
): Promise<string> {
  let mesg = await callback_opts(webapp_client.read_text_file_from_project)(
    opts
  );
  return mesg.content;
}

export async function public_get_text_file(
  opts: ReadTextFileOpts
): Promise<string> {
  return await callback_opts(webapp_client.public_get_text_file)(opts);
}

interface ParserOptions {
  parser: string;
  tabWidth?: number;
  useTabs?: boolean;
}

export async function prettier(
  project_id: string,
  path: string,
  options: ParserOptions
): Promise<void> {
  let resp = await callback_opts(webapp_client.prettier)({
    project_id,
    path,
    options
  });
  if (resp.status === "error") {
    let loc = resp.error.loc;
    if (loc && loc.start) {
      throw Error(
        `Syntax error prevented formatting code (possibly on line ${
          loc.start.line
        } column ${loc.start.column}) -- fix and run again.`
      );
    } else if (resp.error) {
      throw Error(resp.error);
    } else {
      throw Error("Syntax error prevented formatting code.");
    }
  }
}

export function log_error(error: string | object): void {
  if (typeof error != "string") {
    error = JSON.stringify(error);
  }
  webapp_client.log_error(error);
}

interface SyncstringOpts {
  project_id: string;
  path: string;
  cursors?: boolean;
  before_change_hook?: Function;
  after_change_hook?: Function;
  fake?: boolean; // if true make a fake syncstring with a similar API, but does nothing. (Used to make code more uniform.)
  save_interval?: number; // amount to debounce saves (in ms)
  patch_interval?: number;
}

export function syncstring(opts: SyncstringOpts): any {
  const opts1: any = opts;
  if (opts.fake) {
    return new FakeSyncstring();
  } else {
    delete opts.fake;
  }
  opts1.id = schema.client_db.sha1(opts.project_id, opts.path);
  return webapp_client.sync_string(opts1);
}

interface SyncDBOpts {
  project_id: string;
  path: string;
  primary_keys: string[];
  string_cols?: string[];
  cursors?: boolean;
  change_throttle?: number; // amount to throttle change events (in ms)
  save_interval?: number; // amount to debounce saves (in ms)
  patch_interval?: number;
}

export function syncdb(opts: SyncDBOpts): any {
  const opts1: any = opts;
  return webapp_client.sync_db(opts1);
}

interface QueryOpts {
  query: object;
  changes?: boolean;
  options?: object[]; // e.g., [{limit:5}]
}

export async function query(opts: QueryOpts): Promise<any> {
  return callback_opts(webapp_client.query)(opts);
}

export function get_default_font_size(): number {
  const account: any = redux.getStore("account");
  return account
    ? account.get("font_size", DEFAULT_FONT_SIZE)
    : DEFAULT_FONT_SIZE;
}

export function get_editor_settings(): Map<string, any> {
  const account: any = redux.getStore("account");
  if (account) {
    let e = account.get("editor_settings");
    if (e) {
      return e;
    }
  }
  return Map(); // not loaded
}

export async function stripe_admin_create_customer(opts: {
  account_id?: string;
  email_address?: string;
}): Promise<void> {
  return callback_opts(webapp_client.stripe_admin_create_customer)(opts);
}

export interface User {
  account_id: string;
  created: string;
  email_address?: string;
  first_name: string;
  last_active: string | null;
  last_name: string;
}

export async function user_search(opts: {
  query: string;
  query_id?: number;
  limit?: number;
  timeout?: number;
  admin?: boolean;
  active?: string;
}): Promise<User[]> {
  return callback_opts(webapp_client.user_search)(opts);
}

export async function project_websocket(project_id:string) : Promise<any> {
  return await webapp_client.project_websocket(project_id);
}

import { API } from "smc-webapp/project/websocket/api";

export async function project_api(project_id:string) : Promise<API> {
  return (await project_websocket(project_id)).api as API;
}