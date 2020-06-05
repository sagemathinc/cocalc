/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { once } from "smc-util/async-utils";
import { redux } from "../app-framework";
import { QueryParams } from "../misc/query-params";
const { APP_BASE_URL, get_cookie } = require("../misc_page");
import { WelcomeFile } from "./welcome-file";
import { WebappClient } from "./client";
import { CSILauncher } from "../launch/custom-image";
import { is_csi_launchvalue } from "../launch/actions";

/*
If the anonymous query param is set at all (doesn't matter to what) during
initial page load.

Also do NOT make true of has_remember_me is set, since then probably
the user has an account.
*/
export function should_do_anonymous_setup(): boolean {
  const anonymous_query_param = QueryParams.get("anonymous");
  // console.log("anonymous_query_param = ", anonymous_query_param);
  // console.log("cookie = ", get_cookie(`${APP_BASE_URL}has_remember_me`));
  const resp =
    anonymous_query_param !== undefined &&
    get_cookie(`${APP_BASE_URL}has_remember_me`) != "true";
  // console.log("should_do_anonymous_setup ", resp);
  return resp;
}

async function setup_default_project(log) {
  const actions = redux.getActions("projects");
  log("creating project");
  const project_id = await actions.create_project({
    title: "Welcome to CoCalc!",
    start: true,
    description: "",
  });
  log("opening project");
  actions.open_project({ project_id, switch_to: true });

  const launch_actions = redux.getStore("launch-actions");
  if (launch_actions != null && launch_actions.get("launch")) {
    console.log(
      "anonymous setup: do nothing further since there is a launch action"
    );
    return;
  }

  await new WelcomeFile(project_id).open();
}

export async function do_anonymous_setup(
  client: WebappClient,
  csi_launch?: string
): Promise<void> {
  function log(..._args): void {
    // uncomment to debug...
    // console.log("do_anonymous_setup", ..._args);
  }
  log();
  try {
    redux.getActions("account").setState({ doing_anonymous_setup: true });
    log("creating account");
    try {
      const resp = await client.account_client.create_account({});
      if (resp?.event == "account_creation_failed") {
        throw Error(resp.error);
      }
    } catch (err) {
      log("failed to create account", err);
      // If there is an error specifically with creating the account
      // due to the backend not allowing it (e.g., missing token), then
      // it is fine to silently return, which falls back to the login
      // screen.  Of course, all other errors below should make some noise.
      return;
    }
    if (!client.is_signed_in()) {
      log("waiting to be signed in");
      await once(client, "signed_in");
    }

    if (csi_launch != null && is_csi_launchvalue(csi_launch)) {
      await new CSILauncher(csi_launch).launch();
    } else {
      await setup_default_project(log);
    }
  } catch (err) {
    console.warn("ERROR doing anonymous sign up -- ", err);
    log("err", err);
    // There was an error creating the account (probably), so we do nothing
    // further involving making an anonymous account.
    // If the user didn't get signed in, this will fallback to sign in page, which
    // is reasonable behavior.
    // Such an error *should* happen if, e.g., a sign in token is required,
    // or maybe this user's ip is blocked. Falling back
    // to normal sign up makes sense in this case.
    return;
  } finally {
    redux.getActions("account").setState({ doing_anonymous_setup: false });
    log("removing anonymous param");
    // In all cases, remove the 'anonymous' parameter. This way if
    // they refresh their browser it won't cause confusion.
    QueryParams.remove("anonymous");
  }
}
