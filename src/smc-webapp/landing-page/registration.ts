/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";

async function init() {
  const url = window.app_base_url + "/registration";
  const { token } = await (await fetch(url)).json();
  redux.getActions("account").setState({ token });
}

init();
