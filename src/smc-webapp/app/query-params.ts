/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Initialize various things related to the overall page and query params (e.g., fullscreen).
import { is_valid_uuid_string } from "smc-util/misc";
import { QueryParams } from "../misc/query-params";
import { COCALC_FULLSCREEN } from "../fullscreen";
import { redux } from "../app-framework";
import { parse_target } from "../history";
import { webapp_client } from "../webapp-client";

export function init_query_params(): void {
  const actions = redux.getActions("page");
  // enable fullscreen mode upon loading a URL like /app?fullscreen and
  // additionally kiosk-mode upon /app?fullscreen=kiosk
  if (COCALC_FULLSCREEN === "kiosk") {
    actions.set_fullscreen("kiosk");
    // We also check if user is loading a specific project in kiosk mode
    // (which is the only thing they should ever do!), and in that
    // case we record the project_id, so that we can make various
    // query optimizations elsewhere.
    const x = parse_target((window as any).cocalc_target);
    if (x.page === "project" && x.target != null) {
      const kiosk_project_id = x.target.slice(0, 36);
      if (is_valid_uuid_string(kiosk_project_id)) {
        actions.setState({ kiosk_project_id });
      }
    }
  } else if (COCALC_FULLSCREEN === "default") {
    actions.set_fullscreen("default");
  }

  // setup for frontend mocha testing -- TODO: delete all this, since we don't use it!
  const test_query_value = QueryParams.get("test");
  if (test_query_value) {
    // include entryway for running mocha tests.
    actions.setState({ test: test_query_value });
    console.log("TESTING mode -- waiting for sign in...");
    webapp_client.once("signed_in", async () => {
      console.log("TESTING mode -- waiting for projects to load...");
      await redux.getStore("projects").async_wait({
        timeout: 9999999,
        until(store) {
          return store.get("project_map");
        },
      });
      console.log(
        "TESTING mode -- projects loaded; now loading and running tests..."
      );
      require("../test-mocha/setup").mocha_run(test_query_value);
    });
  }

  const get_api_key_query_value = QueryParams.get("get_api_key");
  if (get_api_key_query_value) {
    actions.set_get_api_key(get_api_key_query_value);
    actions.set_fullscreen("default");
  }

  // configure the session
  // This makes it so the default session is 'default' and there is no
  // way to NOT have a session, except via session=, which is treated
  // as "no session" (also no session for kiosk mode).
  // Note that we never have a session in kiosk mode, since you can't
  // access the other files.
  const session =
    COCALC_FULLSCREEN === "kiosk" || test_query_value
      ? ""
      : QueryParams.get("session") ?? "default";
  actions.set_session(session);
}
