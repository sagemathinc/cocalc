/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { parse_target } from "../history2";
import { redux, Store } from "../app-framework";

type TopTab =
  | "account"
  | "project"
  | "projects"
  | "help"
  | "file-use"
  | "notifications"
  | "admin";

export interface PageState {
  active_top_tab: TopTab; // key of the active tab
  show_connection?: boolean;
  ping?: number;
  avgping?: number;
  connection_status?: string;
  connection_quality?: "good" | "bad" | "flaky";
  new_version?: Map<string, any>; // todo
  fullscreen?: "default" | "kiosk";
  test?: string; // test query in the URL
  cookie_warning?: boolean;
  local_storage_warning?: boolean;
  show_file_use?: boolean;
  num_ghost_tabs?: number;
  session?: string; // session query in the URL
  last_status_time?: string;
  get_api_key?: string;
}

export class PageStore extends Store<PageState> {}

redux.createStore("page", PageStore, {
  active_top_tab: parse_target((window as any).cocalc_target).page,
});
