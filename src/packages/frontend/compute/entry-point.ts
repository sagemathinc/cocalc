/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Entry point for compute server version of CoCalc...
*/

// Load/initialize Redux-based react functionality
import "@cocalc/frontend/client/client";
import { redux } from "@cocalc/frontend/app-framework";
import { setEntryPoint } from "@cocalc/frontend/app-framework/entry-point";
import "@cocalc/frontend/jquery-plugins";
import { init as initAccount } from "@cocalc/frontend/account";
import { init as initApp } from "@cocalc/frontend/app/init";
import { init as initProjects } from "@cocalc/frontend/projects";
import { init as initFileUse } from "@cocalc/frontend/file-use/init";
import { init as initMarkdown } from "@cocalc/frontend/markdown/markdown-input/main";
import { init as initCrashBanner } from "@cocalc/frontend/crash-banner";
import "codemirror";
import { init as initLast } from "@cocalc/frontend/last";
import { render } from "@cocalc/frontend/app/render";

export async function init() {
  setEntryPoint("compute");
  initAccount(redux);
  initApp();
  initFileUse();
  initProjects();
  initMarkdown();
  initLast();
  try {
    await initEntryPointState();
    await render();
  } finally {
    // don't insert the crash banner until the main app has rendered,
    // or user would see the banner for a moment.
    initCrashBanner();
  }
  console.log("Loaded Compute Server Entry Point.");
}

import { fromJS } from "immutable";
async function initEntryPointState() {
  console.log("initEntryPointState");
  const customizeStore = redux.getStore("customize");
  await customizeStore.async_wait({
    until: () => customizeStore.get("compute_server"),
  });
  const project_id = customizeStore.getIn([
    "compute_server",
    "project_id",
  ]) as string;
  const project_map = fromJS({
    [project_id]: {
      title: "Compute Server Project (TODO)",
      state: { time: new Date(), state: "running" },
    },
  }) as any;
  const actions = redux.getActions("projects");
  actions.setState({ project_map });
  actions.open_project({ project_id: "81e0c408-ac65-4114-bad5-5f4b6539bd0e" });
}
