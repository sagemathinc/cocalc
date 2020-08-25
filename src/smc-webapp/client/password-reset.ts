/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { QueryParams } from "../misc/query-params";
const { APP_BASE_URL } = require("../misc_page");
const NAME = `${encodeURIComponent(APP_BASE_URL)}PWRESET`;

import Cookies from "universal-cookie";
const cookies = new Cookies();

export function reset_password_key() {
  // we set a temporary session cookie earlier
  const forgot_cookie = cookies.get(NAME);
  if (forgot_cookie != null) {
    return forgot_cookie.toLowerCase();
  } else {
    // some mail transport agents will uppercase the URL -- see https://github.com/sagemathinc/cocalc/issues/294
    const forgot = QueryParams.get("forgot");
    if (forgot && typeof forgot == "string") {
      return forgot.toLowerCase();
    }
  }
  return undefined;
}

export function delete_password_cookie() {
  cookies.remove(NAME);
}
