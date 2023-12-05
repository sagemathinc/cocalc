/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Global app initialization
 */

import debug from "debug";
debug.log = console.log.bind(console); // see https://github.com/debug-js/debug#output-streams

// Load/initialize Redux-based react functionality
import { redux } from "@cocalc/frontend/app-framework";

// Systemwide notifications that are broadcast to all users (and set by admins)
import "@cocalc/frontend/system-notifications";

// News about the platform, features, etc. – also shown at https://$DNS/news
import "@cocalc/frontend/notifications/news/init";

import "@cocalc/frontend/launch/actions";

// Various jquery plugins:
import "@cocalc/frontend/jquery-plugins";

// Initialize app stores, actions, etc.
import { init as initAccount } from "@cocalc/frontend/account";
import { init as initApp } from "@cocalc/frontend/app/init";
import { init as initProjects } from "@cocalc/frontend/projects";
import { init as initCustomSoftware } from "@cocalc/frontend/custom-software/init";
import { init as initFileUse } from "@cocalc/frontend/file-use/init";
import { init as initWebHooks } from "@cocalc/frontend/webapp-hooks";
import { init as initNotifications } from "@cocalc/frontend/notifications/init";
import { init as initMarkdown } from "@cocalc/frontend/markdown/markdown-input/main";
// only enable iframe comms in minimal kiosk mode
import { init as initCrashBanner } from "@cocalc/frontend/crash-banner";

// Do not delete this without first looking at https://github.com/sagemathinc/cocalc/issues/5390
// This import of codemirror forces the initial full load of codemirror
// as part of the main webpack entry point.
import "codemirror";

// Should be loaded last
import { init as initLast } from "@cocalc/frontend/last";

import { render } from "./render";

export async function init() {
  initAccount(redux);
  initApp();
  initProjects();
  initCustomSoftware();
  initFileUse();
  initWebHooks();
  initNotifications(redux);
  initMarkdown();
  $(window).on("beforeunload", redux.getActions("page").check_unload);
  initLast();
  try {
    await render();
  } finally {
    // don't insert the crash banner until the main app has rendered,
    // or user would see the banner for a moment.
    initCrashBanner();
  }
}
