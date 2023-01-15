/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Redux } from "../app-framework";
import { createRoot } from "react-dom/client";

export async function render(): Promise<void> {
  finishedLoading(); // comment this out to leave the loading/startup banner visible so you can use the Chrome dev tools with it.
  const { Page } = await import("./page");
  const container = document.getElementById("cocalc-webapp-container");
  const root = createRoot(container!);
  root.render(
    <Redux>
      <Page />
    </Redux>
  );
}

import ReactDOM from "react-dom";
export async function xxx_render(): Promise<void> {
  finishedLoading(); // comment this out to leave the loading/sartup banner visible
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
