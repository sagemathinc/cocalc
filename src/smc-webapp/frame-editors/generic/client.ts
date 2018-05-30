/*
Typescript async/await rewrite of smc-util/client.coffee...
*/

const webapp_client = require("smc-webapp/webapp_client").webapp_client;
const schema = require("smc-util/schema");
const DEFAULT_FONT_SIZE: number = require("smc-util/db-schema")
  .DEFAULT_FONT_SIZE;
import { redux } from "./react";

import { callback_opts } from "./async-utils";

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
  aggregate?: string | number | {value:(string|number)} ;
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
}

export function syncstring(opts: SyncstringOpts): any {
  const opts1: any = opts;
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

export function default_font_size(): number {
  const account = redux.getStore("account");
  return account
    ? account.get("font_size", DEFAULT_FONT_SIZE)
    : DEFAULT_FONT_SIZE;
}
