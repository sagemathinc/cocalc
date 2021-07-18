/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Typescript async/await rewrite of smc-util/client.coffee...
*/

import { webapp_client } from "../../webapp-client";
const schema = require("smc-util/schema");
const DEFAULT_FONT_SIZE: number = require("smc-util/db-schema")
  .DEFAULT_FONT_SIZE;
import { redux } from "../../app-framework";
import { callback2 } from "smc-util/async-utils";
import { FakeSyncstring } from "./syncstring-fake";
import { Map } from "immutable";
import { CompressedPatch } from "smc-util/sync/editor/generic/types";
import { ExecOpts, ExecOutput } from "../../client/project";
import { Config as FormatterConfig } from "smc-project/formatters";
export { ExecOpts, ExecOutput };

export function server_time(): Date {
  return webapp_client.time_client.server_time();
}

// async version of the webapp_client exec -- let's you run any code in a project!
export async function exec(opts: ExecOpts): Promise<ExecOutput> {
  return await webapp_client.project_client.exec(opts);
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
  try {
    await webapp_client.project_client.touch(project_id);
  } catch (err) {
    console.warn(`unable to touch '${project_id}' -- ${err}`);
  }
}

// return true, if this actually started the project
// throwing a timeout means it attempted to start
export async function start_project(
  project_id: string,
  timeout: number = 60
): Promise<boolean> {
  const store = redux.getStore("projects");
  function is_running() {
    return store.get_state(project_id) === "running";
  }
  if (is_running()) {
    // already running, so done.
    return false;
  }
  // Start project running.
  const did_start = await redux
    .getActions("projects")
    .start_project(project_id);
  // Wait until running (or fails without timeout).
  await callback2(store.wait, { until: is_running, timeout });
  return did_start;
}

// return true, if this actually stopped the project
// throwing a timeout means it attempted to stop
export async function stop_project(
  project_id: string,
  timeout: number = 60
): Promise<boolean> {
  const store = redux.getStore("projects");
  function is_not_running() {
    return store.get_state(project_id) !== "running";
  }
  if (is_not_running()) {
    return false;
  }
  // Start project running.
  const did_stop = await redux.getActions("projects").stop_project(project_id);
  // Wait until running (or fails without timeout).
  await callback2(store.wait, { until: is_not_running, timeout });
  return did_stop;
}

interface ReadTextFileOpts {
  project_id: string;
  path: string;
}

export async function read_text_file_from_project(
  opts: ReadTextFileOpts
): Promise<string> {
  return await webapp_client.project_client.read_text_file(opts);
}

interface WriteTextFileOpts {
  project_id: string;
  path: string;
  content: string;
}

export async function write_text_file_to_project(
  opts: WriteTextFileOpts
): Promise<void> {
  await webapp_client.project_client.write_text_file(opts);
}

export async function formatter(
  project_id: string,
  path: string,
  config: FormatterConfig
): Promise<CompressedPatch> {
  const api = await webapp_client.project_client.api(project_id);
  const resp = await api.formatter(path, config);

  if (resp.status === "error") {
    const loc = resp.error.loc;
    if (loc && loc.start) {
      throw Error(
        `Syntax error prevented formatting code (possibly on line ${loc.start.line} column ${loc.start.column}) -- fix and run again.`
      );
    } else if (resp.error) {
      throw Error(resp.error);
    } else {
      throw Error("Syntax error prevented formatting code.");
    }
  } else {
    return resp.patch;
  }
}

export function log_error(error: string | object): void {
  webapp_client.tracking_client.log_error(error);
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

import { DataServer } from "smc-util/sync/editor/generic/sync-doc";

import { SyncString } from "smc-util/sync/editor/string/sync";

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

export interface SyncDBOpts {
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
  file_use_interval?: number;
}

export function syncdb(opts: SyncDBOpts): any {
  const opts1: any = opts;
  return webapp_client.sync_db(opts1);
}

import { SyncDB } from "smc-util/sync/editor/db/sync";

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
  options?: object[]; // e.g., [{limit:5}],
  no_post?: boolean;
}

export async function query(opts: QueryOpts): Promise<any> {
  return await webapp_client.query_client.query(opts);
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
    const e = account.get("editor_settings");
    if (e) {
      return e;
    }
  }
  return Map(); // not loaded
}

export interface User {
  account_id: string;
  created?: Date;
  email_address?: string;
  first_name?: string;
  last_active?: Date;
  last_name?: string;
  banned?: boolean;
}

export async function user_search(opts: {
  query: string;
  limit?: number;
  admin?: boolean;
  active?: string;
}): Promise<User[]> {
  return await webapp_client.users_client.user_search(opts);
}

export async function project_websocket(project_id: string): Promise<any> {
  return await webapp_client.project_client.websocket(project_id);
}

import { API } from "smc-webapp/project/websocket/api";

export async function project_api(project_id: string): Promise<API> {
  return (await project_websocket(project_id)).api as API;
}

// Returns the raw URL to read the file from the project.
export function raw_url_of_file(project_id: string, path: string): string {
  return webapp_client.project_client.read_file({ project_id, path });
}
