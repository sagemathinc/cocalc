/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "smc-util/misc";
import { webapp_client } from "../webapp-client";
import { AccountActions } from "./actions";
import { AccountStore } from "./store";
import { AccountTable } from "./table";
import { init_dark_mode } from "./dark-mode";
import { reset_password_key } from "../client/password-reset";
import { hasRememberMe } from "smc-util/remember-me";

export function init(redux) {
  // Register account store
  // Use the database defaults for all account info until this gets set after they login
  const init = misc.deep_copy(
    require("smc-util/schema").SCHEMA.accounts.user_query.get.fields
  );
  // ... except for show_global_info2 (null or a timestamp)
  // REGISTER and STRATEGIES are injected in app.html via the /customize endpoint -- do not delete them!
  init.token = global["REGISTER"];
  init.strategies = global["STRATEGIES"];
  init.other_settings.show_global_info2 = "loading"; // indicates there is no data yet
  init.editor_settings.physical_keyboard = "NO_DATA"; // indicator that there is no data
  init.user_type = hasRememberMe(window.app_base_path) ? "signing_in" : "public"; // default
  const store = redux.createStore("account", AccountStore, init);
  const actions = redux.createActions("account", AccountActions);

  actions._init(store);
  init_dark_mode(store);

  redux.createTable("account", AccountTable);

  // Password reset
  actions.setState({ reset_key: reset_password_key() });

  // Login status
  webapp_client.on("signed_in", function (mesg) {
    if (mesg != null ? mesg.api_key : undefined) {
      // wait for sign in to finish and cookie to get set, then redirect
      const f = () =>
        (window.location.href = `https://authenticated?api_key=${mesg.api_key}`);
      setTimeout(f, 2000);
    }
    redux.getActions("account").set_user_type("signed_in");
  });

  webapp_client.on("signed_out", () =>
    redux.getActions("account").set_user_type("public")
  );

  webapp_client.on("remember_me_failed", () =>
    redux.getActions("account").set_user_type("public")
  );

  // Autosave interval
  let _autosave_interval: NodeJS.Timeout | undefined = undefined;
  const init_autosave = function (autosave) {
    if (_autosave_interval) {
      // This function can safely be called again to *adjust* the
      // autosave interval, in case user changes the settings.
      clearInterval(_autosave_interval);
      _autosave_interval = undefined;
    }

    // Use the most recent autosave value.
    if (autosave) {
      const save_all_files = function () {
        if (webapp_client.is_connected()) {
          redux.getActions("projects")?.save_all_files();
        }
      };
      _autosave_interval = setInterval(save_all_files, autosave * 1000);
    }
  };

  let _last_autosave_interval_s = undefined;
  store.on("change", function () {
    const interval_s = store.get("autosave");
    if (interval_s !== _last_autosave_interval_s) {
      _last_autosave_interval_s = interval_s;
      init_autosave(interval_s);
    }
  });

  // Standby timeout
  let last_set_standby_timeout_m = undefined;
  store.on("change", function () {
    // NOTE: we call this on any change to account settings, which is maybe too extreme.
    const x = store.getIn(["other_settings", "standby_timeout_m"]);
    if (last_set_standby_timeout_m !== x) {
      last_set_standby_timeout_m = x;
      webapp_client.idle_client.set_standby_timeout_m(x);
    }
  });
}
