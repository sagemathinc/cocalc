/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Initialize various things related to the overall page and query params (e.g., fullscreen).
import { redux } from "@cocalc/frontend/app-framework";
import target from "@cocalc/frontend/client/handle-target";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { COCALC_FULLSCREEN } from "@cocalc/frontend/fullscreen";
import { parse_target } from "@cocalc/frontend/history";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { A11Y } from "@cocalc/util/consts/ui";
import { is_valid_uuid_string } from "@cocalc/util/misc";

function init_fullscreen_mode(): void {
  const actions = redux.getActions("page");
  // enable fullscreen mode upon loading a URL like /app?fullscreen and
  // additionally kiosk-mode upon /app?fullscreen=kiosk
  if (COCALC_FULLSCREEN === "kiosk") {
    actions.set_fullscreen("kiosk");
    // We also check if user is loading a specific project in kiosk mode
    // (which is the only thing they should ever do!), and in that
    // case we record the project_id, so that we can make various
    // query optimizations elsewhere.
    const x = parse_target(target);
    if (x.page === "project" && x.target != null) {
      const kiosk_project_id = x.target.slice(0, 36);
      if (is_valid_uuid_string(kiosk_project_id)) {
        actions.setState({ kiosk_project_id });
      }
    }
  } else if (COCALC_FULLSCREEN === "default") {
    actions.set_fullscreen("default");
    // We no longer need fullscreen in the query parameter:
    QueryParams.remove("fullscreen");
  } else if (COCALC_FULLSCREEN === "project") {
    actions.set_fullscreen("project");
  }
}

function init_api_key(): void {
  const actions = redux.getActions("page");
  const get_api_key_query_value = QueryParams.get("get_api_key");
  if (get_api_key_query_value) {
    actions.set_get_api_key(get_api_key_query_value);
    actions.set_fullscreen("project");
  }
}

function init_session(): void {
  const actions = redux.getActions("page");
  // configure the session
  // This makes it so the default session is 'default' and there is no
  // way to NOT have a session, except via session=, which is treated
  // as "no session" (also no session for kiosk mode).
  // Note that we never have a session in kiosk mode, since you can't
  // access the other files.
  // If click on link with ?session=, then you get no session, e.g,. this
  // is used for doing a pop-out of a single file.  Should have no impact
  // on sessions at all.
  if (COCALC_FULLSCREEN === "kiosk") {
    actions.set_session(""); // no session
  } else {
    const key = `session${appBasePath}`;
    const querySession = QueryParams.get("session");
    let session: any = querySession ?? get_local_storage(key) ?? "default";

    if (typeof session != "string") {
      // should never happen, but of course it could since user could put anything in URL query params
      // We just reset to default in this case.
      session = "default";
    }
    actions.set_session(session);
    if (session) {
      // So when you don't give session= param in this browser in the future
      // it defaults to the one you did use (or "default").
      set_local_storage(key, session);
    }
  }
  // Do not need or want it in our URL once we've consumed it.  Critical to
  // not have session in the URL, so we can share url's without infected
  // other user's session.
  QueryParams.remove("session");
}

function parse_accessibility_param(param: string): boolean | null {
  if (param === "true" || param === "on" || param === "1") {
    return true;
  }
  if (param === "false" || param === "off" || param === "0") {
    return false;
  }
  return null;
}

async function init_accessibility(): Promise<void> {
  // Handle accessibility query parameter
  // If ?accessibility=true or =on, enable accessibility mode permanently
  // If ?accessibility=false or =off, disable it permanently
  // This allows sharing URLs that automatically enable accessibility
  const accessibilityParam = QueryParams.get(A11Y);
  if (accessibilityParam == null) {
    return;
  }

  const enabled = parse_accessibility_param(accessibilityParam);
  QueryParams.remove(A11Y);

  if (enabled == null) {
    return;
  }

  try {
    // Wait for account store to be ready before setting accessibility
    const store = redux.getStore("account");
    if (!store || typeof store.async_wait !== "function") {
      console.warn("Account store not ready");
      return;
    }

    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0,
    });

    // Preserve existing accessibility settings
    const existingSettingsStr = store.getIn(["other_settings", A11Y]);
    let existingSettings = { enabled: false };
    if (existingSettingsStr) {
      try {
        existingSettings = JSON.parse(existingSettingsStr);
      } catch {
        // Ignore parse errors, use default
      }
    }

    // Merge with new enabled value
    const settings = { ...existingSettings, enabled };
    const accountActions = redux.getActions("account");
    accountActions.set_other_settings(A11Y, JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to set accessibility from query param:", err);
  }
}

export function init_query_params(): void {
  init_fullscreen_mode();
  init_api_key();
  init_session();
  // Run accessibility init in background without blocking
  // to avoid delaying other store initializations
  init_accessibility();
}
