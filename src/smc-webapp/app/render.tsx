/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, ReactDOM, Redux } from "../app-framework";
import { Page } from "./page";

export function render(): void {
  ReactDOM.render(
    <Redux>
      <Page />
    </Redux>,
    document.getElementById("cocalc-webapp-container")
  );
  // Loading is done, so remove any visible artifacts of loading.
  // This doesn't remove anything added to the head.
  document.getElementById("cocalc-load-container").innerHTML = '';
}
