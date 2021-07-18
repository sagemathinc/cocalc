/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Code related to the history and URL in the browser bar.

The URI schema is as follows:
     Overall help:
        https://cocalc.com/help
     Overall settings:
        https://cocalc.com/settings
     Account settings (default):
        https://cocalc.com/settings/account
     Billing:
        https://cocalc.com/settings/billing
     Upgrades:
        https://cocalc.com/settings/upgrades
     Licenes:
        https://cocalc.com/settings/licenses
     Support:
        https://cocalc.com/settings/support
     Projects page:
        https://cocalc.com/projects/
     Specific project:
        https://cocalc.com/projects/project-id/
     Create new file page (in given directory):
        https://cocalc.com/projects/project-id/new/path/to/dir
     Search (in given directory):
        https://cocalc.com/projects/project-id/search/path/to/dir
     Settings:
        https://cocalc.com/projects/project-id/settings
     Log:
        https://cocalc.com/projects/project-id/log
     Directory listing (must have slash at end):
       https://cocalc.com/projects/project-id/files/path/to/dir/
     Open file:
       https://cocalc.com/projects/project-id/files/path/to/file
     (From before) raw http:
       https://cocalc.com/projects/project-id/raw/path/...
     (From before) proxy server (supports websockets and ssl) to a given port.
       https://cocalc.com/projects/project-id/port/<number>/.
*/

import { redux } from "./app-framework";
import { QueryParams } from "./misc/query-params";
import * as query_string from "query-string";
import { join } from "path";

// Determine query params part of URL based on state of the project store.
// This also leaves unchanged any *other* params already there (i.e., not
// the "managed" params that are explicitly listed in the code below).
function params(): string {
  const page = redux.getStore("page");
  const current = QueryParams.get_all();
  if (page != null) {
    for (let param of ["fullscreen", "session", "get_api_key", "test"]) {
      const val = page.get(param);
      if (val) {
        current[param] = val;
      } else {
        delete current[param];
      }
    }
  }

  const s = query_string.stringify(current);
  if (s) {
    return "?" + s;
  } else {
    return "";
  }
}

// The last explicitly set url.
let last_url: string | undefined = undefined;
let last_full_url: string | undefined = undefined;

// Update what params are set to in the URL based on state of project store,
// leaving the rest of the URL the same.
export function update_params() {
  if (last_url != null) {
    set_url(last_url);
  }
}

export function set_url(url: string) {
  last_url = url;
  const query_params = params();
  const full_url = join(window.app_base_path, url + query_params);
  if (full_url === last_full_url) {
    // nothing to do
    return;
  }
  last_full_url = full_url;
  window.history.pushState("", "", full_url);
}

// Now load any specific page/project/previous state
export function load_target(
  target: string,
  ignore_kiosk: boolean = false,
  change_history: boolean = true
) {
  if (!target) {
    return;
  }
  const logged_in = redux.getStore("account").get("is_logged_in");
  const segments = target.split("/");
  switch (segments[0]) {
    case "help":
      redux.getActions("page").set_active_tab("about", change_history);
      break;
    case "projects":
      if (segments.length > 1) {
        redux
          .getActions("projects")
          .load_target(
            segments.slice(1).join("/"),
            true,
            ignore_kiosk,
            change_history
          );
      } else {
        redux.getActions("page").set_active_tab("projects", change_history);
      }
      break;
    case "settings":
      if (!logged_in) {
        return;
      }
      redux.getActions("page").set_active_tab("account", false);

      if (segments[1] === "account") {
        redux.getActions("account").set_active_tab("account");
      }

      if (segments[1] === "billing") {
        const actions = redux.getActions("billing");
        actions?.update_customer();
        redux.getActions("account").set_active_tab("billing");
        if (actions == null) {
          // ugly temporary hack.
          setTimeout(() => {
            redux.getActions("billing")?.update_customer();
          }, 5000);
        }
      }

      if (segments[1] === "upgrades") {
        redux.getActions("account").set_active_tab("upgrades");
      }

      if (segments[1] === "licenses") {
        redux.getActions("account").set_active_tab("licenses");
      }

      if (segments[1] === "support") {
        redux.getActions("account").set_active_tab("support");
      }

      if (segments[1] === "ssh-keys") {
        redux.getActions("account").set_active_tab("ssh-keys");
      }
      break;

    case "notifications":
      if (!logged_in) {
        return;
      }
      redux.getActions("page").set_active_tab("notifications", change_history);

      if (segments[1] === "mentions") {
        redux.getActions("page").set_active_tab("mentions");
      }
      break;

    case "file-use":
      // not implemented
      break;
    case "admin":
      if (!logged_in) {
        return;
      }
      redux.getActions("page").set_active_tab(segments[0], change_history);
      break;
  }
}

window.onpopstate = (_) => {
  load_target(
    decodeURIComponent(
      document.location.pathname.slice(window.app_base_path.length + 1)
    ),
    false,
    false
  );
};

export function parse_target(target?: string):
  | { page: "projects" | "help" | "file-use" | "notifications" | "admin" }
  | { page: "project"; target: string }
  | {
      page: "account";
      tab:
        | "account"
        | "billing"
        | "upgrades"
        | "licenses"
        | "support"
        | "ssh-keys";
    }
  | {
      page: "notifications";
      tab: "mentions";
    } {
  if (target == undefined) {
    return { page: "account", tab: "account" };
  }
  const segments = target.split("/");
  switch (segments[0]) {
    case "projects":
      if (segments.length < 2 || (segments.length == 2 && segments[1] == "")) {
        return { page: "projects" };
      } else {
        return { page: "project", target: segments.slice(1).join("/") };
      }
    case "settings":
      switch (segments[1]) {
        case "account":
        case "billing":
        case "upgrades":
        case "licenses":
        case "support":
        case "ssh-keys":
          return {
            page: "account",
            tab: segments[1] as
              | "account"
              | "billing"
              | "upgrades"
              | "licenses"
              | "support"
              | "ssh-keys",
          };
        default:
          return { page: "account", tab: "account" };
      }
    case "notifications":
      return { page: "notifications" };
    case "help":
      return { page: "help" };
    case "file-use":
      return { page: "file-use" };
    case "admin":
      return { page: "admin" };
    default:
      return { page: "account", tab: "account" };
  }
}
