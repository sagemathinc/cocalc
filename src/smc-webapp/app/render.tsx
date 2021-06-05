/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, ReactDOM, Redux } from "../app-framework";

export async function render(): Promise<void> {
  finishedLoading();
  const { Page } = await import("./page");
  ReactDOM.render(
    <Redux>
      <Page />
    </Redux>,
    document.getElementById("cocalc-webapp-container")
  );
}

// When loading is done, remove any visible artifacts.
// This doesn't remove anything added to the head.
function finishedLoading() {
  const load = document.getElementById("cocalc-load-container");
  if (load != null) {
    load.innerHTML = "";
  }
}
