/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/**
 * Sets up some hooks for webapp_client
 * This file is all side effects.
 * Should be imported ONCE at the top level of the app
 */
import { alert_message } from "./alerts";
import { redux } from "./app-framework";
import { webapp_client } from "./webapp-client";
import { should_load_target_url } from "./misc-page";
import { reset_password_key } from "./client/password-reset";
import { load_target } from "./history";
import {
  deleteRememberMe,
  hasRememberMe,
  setRememberMe,
} from "smc-util/remember-me";

let first_login = true;

export function init() {
  // load more of the app now that user is logged in.
  const load_app = (cb) =>
    (require as any).ensure([], function () {
      require("./account/account-page"); // initialize react-related account page
      require("./projects/actions"); // initialize projects list
      cb();
    });

  webapp_client.on("mesg_info", function (info) {
    const f = () => {
      const account_store = redux.getActions("account");
      if (account_store != undefined) {
        account_store.setState({ mesg_info: info });
      }
    };
    // must be scheduled separately, since this notification can be triggered during rendering
    setTimeout(f, 1);
  });

  function signed_in(mesg) {
    setRememberMe(window.app_base_path);
    // Record which hub we're connected to.
    redux.getActions("account").setState({ hub: mesg.hub });
    console.log(`Signed into ${mesg.hub} at ${new Date()}`);
    if (first_login) {
      first_login = false;
      if (!should_load_target_url()) {
        load_app(() => load_target("projects"));
      }
    }
  }
  // loading a possible target is done after restoring a session -- see session.coffee

  // Listen for pushed sign_in events from the server.  This is one way that
  // the sign_in function above can be activated, but not the only way.
  webapp_client.on("signed_in", signed_in);

  //###############################################
  // Automatically log in
  //###############################################
  if (reset_password_key()) {
    // Attempting to do a password reset -- clearly we do NOT want to wait in the hopes
    // that sign in via a cookie is going to work.  Without deleting this, the reset
    // password dialog that appears will immediately vanish with a frustrating redirect.
    deleteRememberMe(window.app_base_path);
  }

  if (hasRememberMe(window.app_base_path)) {
    redux.getActions("account").setState({ remember_me: true });
    // just in case, always show manual login screen after 45s.
    setTimeout(
      () => redux.getActions("account").setState({ remember_me: false }),
      45000
    );
  }
  webapp_client.on("remember_me_failed", function () {
    redux.getActions("account").setState({ remember_me: false });
    const account_store = redux.getStore("account");
    if (account_store && account_store.get("is_logged_in")) {
      // if we thought user was logged in, but the cookie was invalid, force them to sign in again
      const f = function () {
        if (!hasRememberMe(window.app_base_path)) {
          alert_message({
            type: "info",
            message: "You might have to sign in again.",
            timeout: 1000000,
          });
        }
      };
      setTimeout(f, 15000);
    }
  }); // give it time to possibly resolve itself.  SMELL: confused about what is going on here...

  // Check if user has a has_remember_me cookie (regardless if it is valid or not)
  // the real "remember_me" is set to be http-only and hence not accessible from javascript (security).
  redux.getActions("account").setState({
    has_remember_me: hasRememberMe(window.app_base_path),
  });

  // Ensure the hooks to process various things after user signs in
  // are enabled.
  require("./landing-page/sign-in-hooks");
}
