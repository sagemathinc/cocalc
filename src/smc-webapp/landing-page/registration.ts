/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";

function get_registration_fallback() {
  $.get(window.app_base_url + "/registration", function (obj, status) {
    if (status === "success") {
      redux.getActions("account").setState({ token: obj.token });
    }
  });
}

export function init() {
  const data = global["CUSTOMIZE"];
  if (data == null) {
    console.warn("landing-page/registration: need to use fallback method");
    get_registration_fallback();
  }
}
