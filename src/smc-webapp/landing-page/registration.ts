/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { redux } from "../app-framework";

async function init() {
  const url = join(window.app_base_path, "registration");
  const { token } = await (await fetch(url)).json();
  redux.getActions("account").setState({ token });
}

init();
