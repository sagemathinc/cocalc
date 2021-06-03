/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Global app initialization
 */

import * as fullscreen from "./fullscreen";

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
import { init as account_init } from "./account";
import { init as app_init } from "./app/init";
import { init as projects_init } from "./projects";

import { init as custom_software_init } from "./custom-software/init";

import { init as file_use_init } from "./file-use/init";

import { init as webapp_hooks_init } from "./webapp-hooks";

import { init as notifications_init } from "./notifications/init";

import { init as markdown_init } from "./widget-markdown-input/main";

// only enable iframe comms in minimal kiosk mode
import { init as iframe_comm_init } from "./iframe-communication";

import { init as init_crash_banner } from "./crash-banner";

// Should be loaded last
import { init as init_last } from "./last";

import { render } from "./app/render";

export async function init() {
  account_init(redux);
  app_init();
  projects_init();
  custom_software_init();
  file_use_init();
  webapp_hooks_init();
  if (!fullscreen.COCALC_MINIMAL) {
    notifications_init(redux);
  }
  markdown_init();
  if (fullscreen.COCALC_MINIMAL) {
    iframe_comm_init();
  }
  $(window).on("beforeunload", redux.getActions("page").check_unload);
  init_last();
  try {
    await render();
  } finally {
    // don't insert the crash banner until the main app has rendered,
    // or user would see the banner for a moment.
    init_crash_banner();
  }
}
