/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { redux } from "../app-framework";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

async function init() {
  const url = join(appBasePath, "registration");
  const { token } = await (await fetch(url)).json();
  redux.getActions("account").setState({ token });
}

init();
