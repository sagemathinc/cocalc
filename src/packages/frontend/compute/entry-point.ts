/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Entry point for compute server version of CoCalc...
*/

// Load/initialize Redux-based react functionality
import "@cocalc/frontend/client/client";
import { redux, setEntryPoint } from "../app-framework";
import "../jquery-plugins";
import { init as initAccount } from "../account";
import { init as initApp } from "../app/init";
import { init as initProjects } from "../projects";
import { init as initMarkdown } from "../markdown/markdown-input/main";
import { init as initCrashBanner } from "../crash-banner";
import "codemirror";
import { init as initLast } from "../last";
import { render } from "../app/render";

export async function init() {
  setEntryPoint("compute");
  initAccount(redux);
  initApp();
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
  redux.getActions("projects").setState({ project_map });
}
