/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Global app initialization
 */

import { COCALC_MINIMAL } from "./fullscreen";

// Load/initialize Redux-based react functionality
import { redux } from "./app-framework";

// Initialize server stats redux store
import "./server-stats";

// Systemwide notifications that are broadcast to all users (and set by admins)
import "./system-notifications";

import "./launch/actions";

// Various jquery plugins:
import "./jquery-plugins";
// Another jquery plugin:
import "./process-links";

// Initialize app stores, actions, etc.
import { init as initAccount } from "./account";
import { init as initApp } from "./app/init";
import { init as initProjects } from "./projects";
import { init as initCustomSoftware } from "./custom-software/init";
import { init as initFileUse } from "./file-use/init";
import { init as initWebHooks } from "./webapp-hooks";
import { init as initNotifications } from "./notifications/init";
import { init as initMarkdown } from "./widget-markdown-input/main";
// only enable iframe comms in minimal kiosk mode
import { init as initIframeComm } from "./iframe-communication";
import { init as initCrashBanner } from "./crash-banner";

// Do not delete this without first looking at https://github.com/sagemathinc/cocalc/issues/5390
// This import of codemirror is force the initial full load of codemirror as part of the
// main webpack entry point.
import "codemirror";

// Should be loaded last
import { init as initLast } from "./last";

import { render } from "./app/render";

export async function init() {
  initAccount(redux);
  initApp();
  initProjects();
  initCustomSoftware();
  initFileUse();
  initWebHooks();
  if (!COCALC_MINIMAL) {
    initNotifications(redux);
  }
  initMarkdown();
  if (COCALC_MINIMAL) {
    initIframeComm();
  }
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
