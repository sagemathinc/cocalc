/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { once } from "smc-util/async-utils";
import { redux } from "../app-framework";
import { QueryParams } from "../misc/query-params";
import { WelcomeFile } from "./welcome-file";
import { WebappClient } from "./client";
import { NAME as LAUNCH_NAME } from "../launch/actions";
import { PROJECT_INVITE_QUERY_PARAM } from "../collaborators/handle-project-invite";
import { hasRememberMe } from "smc-util/remember-me";

export const ANON_PROJECT_TITLE = "Welcome to CoCalc!";

/*
should_do_anonymous_setup: Determine if the anonymous query param is set at all
(doesn't matter to what) during initial page load. Similar, if the
project_invite query param is set, this implies anonymous, so we also do anon
setup there if the user isn't already (likely) signed in.

Also do NOT make true if has_remember_me is set, since then probably
the user has an account.
*/
let project_invite_query_param = QueryParams.get(PROJECT_INVITE_QUERY_PARAM);
export function should_do_anonymous_setup(): boolean {
  const anonymous_query_param = QueryParams.get("anonymous");
  return (
    (anonymous_query_param != null || project_invite_query_param != null) &&
    !hasRememberMe(window.app_base_path)
  );
}

async function setup_default_project(log) {
  const actions = redux.getActions("projects");
  log("creating project");
  const project_id = await actions.create_project({
    title: ANON_PROJECT_TITLE,
    start: true,
    description: "",
  });
  log("opening project");
  actions.open_project({ project_id, switch_to: true });
  await new WelcomeFile(project_id).open();
}

export async function do_anonymous_setup(client: WebappClient): Promise<void> {
  function log(..._args): void {
    // uncomment to debug...
    // console.log("do_anonymous_setup", ..._args);
  }
  log();
  try {
    redux.getActions("account").setState({ doing_anonymous_setup: true });
    log("creating account");
    try {
      const resp = await client.account_client.create_account({
        first_name: "Anonymous",
        last_name: `User-${Math.round(new Date().valueOf() / 1000)}`,
      });
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
    if (project_invite_query_param) {
      // This will get handled elsewhere.  In particular, we
      // don't need to do anything else besides make
      // their anonymous account.
      return;
    }

    // "share" and "custom software images" create projects on their own!
    const launch_store = redux.getStore(LAUNCH_NAME);
    const need_project = !launch_store.get("type");
    if (need_project) {
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
