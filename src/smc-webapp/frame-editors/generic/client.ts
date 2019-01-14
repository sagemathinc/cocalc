/*
Typescript async/await rewrite of smc-util/client.coffee...
*/

const webapp_client = require("smc-webapp/webapp_client").webapp_client;
const schema = require("smc-util/schema");
const DEFAULT_FONT_SIZE: number = require("smc-util/db-schema")
  .DEFAULT_FONT_SIZE;
import { redux } from "../../app-framework";
import { callback2 } from "smc-util/async-utils";
import { FakeSyncstring } from "./syncstring-fake";
import { Map } from "immutable";

export function server_time(): Date {
  return webapp_client.server_time();
}

export interface ExecOpts {
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
  env?: any; // custom environment variables.
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  time: number; // time in ms, from user point of view.
}

// async version of the webapp_client exec -- let's you run any code in a project!
export async function exec(opts: ExecOpts): Promise<ExecOutput> {
  let msg = await callback2(webapp_client.exec, opts);
  if (msg.status && msg.status == "error") {
    throw new Error(msg.error);
  }
  return msg;
}

export async function touch(project_id: string, path: string): Promise<void> {
  // touch the file on disk
  await exec({ project_id, command: "touch", args: [path] });
  // Also record in file-use table that we are editing the file (so appears in file use)
  // Have to use any type, since file_use isn't converted to typescript yet.
  const actions: any = redux.getActions("file_use");
  if (actions != null && typeof actions.mark_file === "function") {
    actions.mark_file(project_id, path, "edit");
  }
}

// Resets the idle timeout timer and makes it known we are using the project.
export async function touch_project(project_id: string): Promise<void> {
  return await callback2(webapp_client.touch_project, { project_id });
}

export async function start_project(
  project_id: string,
  timeout: number = 60
): Promise<void> {
  const store = redux.getStore("projects");
  function is_running() {
    return store.get_state(project_id) === "running";
  }
  if (is_running()) {
    // already running, so done.
    return;
  }
  // Start project running.
  redux.getActions("projects").start_project(project_id);
  // Wait until running (or fails without timeout).
  await callback2(store.wait, { until: is_running, timeout });
}

interface ReadTextFileOpts {
  project_id: string;
  path: string;
  timeout?: number;
}

/*
export async function exists_in_project(
  project_id:string, path:string) : Promise<boolean> {

}
*/

export async function read_text_file_from_project(
  opts: ReadTextFileOpts
): Promise<string> {
  let mesg = await callback2(webapp_client.read_text_file_from_project, opts);
  return mesg.content;
}

interface WriteTextFileOpts {
  project_id: string;
  path: string;
  content: string;
}

export async function write_text_file_to_project(
  opts: WriteTextFileOpts
): Promise<void> {
  await callback2(webapp_client.write_text_file_to_project, opts);
}

export async function public_get_text_file(
  opts: ReadTextFileOpts
): Promise<string> {
  return await callback2(webapp_client.public_get_text_file, opts);
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
  let resp = await callback2(webapp_client.prettier, {
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

import { DataServer } from 'smc-util/sync/editor/generic/sync-doc';

import { SyncString } from 'smc-util/sync/editor/string/sync';

interface SyncstringOpts2 {
  project_id: string;
  path: string;
  cursors?: boolean;
  save_interval?: number; // amount to debounce saves (in ms)
  patch_interval?: number;
  persistent?: boolean;
  data_server?: DataServer;
}

export function syncstring2(opts: SyncstringOpts2): SyncString {
  const opts1: any = opts;
  opts1.client = webapp_client;
  return new SyncString(opts1);
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
  persistent?: boolean;
  data_server?: DataServer;
}

export function syncdb(opts: SyncDBOpts): any {
  const opts1: any = opts;
  return webapp_client.sync_db(opts1);
}

import { SyncDB } from 'smc-util/sync/editor/db/sync';

export function syncdb2(opts: SyncDBOpts): SyncDB {
  if (opts.primary_keys.length <= 0) {
    throw Error("primary_keys must be array of positive length");
  }
  const opts1: any = opts;
  opts1.client = webapp_client;
  return new SyncDB(opts1);
}

interface QueryOpts {
  query: object;
  changes?: boolean;
  options?: object[]; // e.g., [{limit:5}]
}

export async function query(opts: QueryOpts): Promise<any> {
  return callback2(webapp_client.query, opts);
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
  return callback2(webapp_client.stripe_admin_create_customer, opts);
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
  return callback2(webapp_client.user_search, opts);
}

export async function project_websocket(project_id: string): Promise<any> {
  return await webapp_client.project_websocket(project_id);
}

import { API } from "smc-webapp/project/websocket/api";

export async function project_api(project_id: string): Promise<API> {
  return (await project_websocket(project_id)).api as API;
}

