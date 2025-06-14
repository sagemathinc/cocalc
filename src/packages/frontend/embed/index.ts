/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Entry point for embedded version of CoCalc embedding in an iframe.
This is for editing exactly one file.
*/

console.log("Embed mode");

// Load/initialize Redux-based react functionality
import "@cocalc/frontend/client/client";
import { redux } from "../app-framework";
import "../jquery-plugins";

// Initialize app stores, actions, etc.
import { init as initAccount } from "../account";
import { init as initApp } from "../app/init";
import { init as initProjects } from "../projects";
import { init as initMarkdown } from "../markdown/markdown-input/main";
import { init as initCrashBanner } from "../crash-banner";
import { init as initCustomize } from "../customize";


// Do not delete this without first looking at https://github.com/sagemathinc/cocalc/issues/5390
// This import of codemirror forces the initial full load of codemirror
// as part of the main webpack entry point.
import "codemirror";

import { init as initLast } from "../last";
import { render } from "../app/render";

export async function init() {
  initAccount(redux);
  initApp();
  initProjects();
  initMarkdown();
  initCustomize();
  initLast();
  try {
    await render();
  } finally {
    // don't insert the crash banner until the main app has rendered,
    // or user would see the banner for a moment.
    initCrashBanner();
  }
}
