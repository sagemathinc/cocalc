/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Global app initialization
 */

import * as fullscreen from "./fullscreen";

// FUTURE: This is needed only for the old non-react editors; will go away.
const html =
  require("./console.html") +
  require("./editor.html") +
  require("./jupyter.html") +
  require("./sagews/interact.html") +
  require("./sagews/3d.html") +
  require("./sagews/d3.html");
$("body").append(html);

// deferred initialization of buttonbars until after global imports -- otherwise, the sagews sage mode bar might be blank
const { init_buttonbars } = require("./editors/editor-button-bar");
init_buttonbars();

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

/*
 * Initialize app stores, actions, etc.
 */
import "./app/init";

import { init as custom_software_init } from "./custom-software/init";
custom_software_init();

import { init as account_init } from "./account";
account_init(redux);

import "./file-use/init";
import "./webapp-hooks";

import { init as notifications_init } from "./notifications";
if (!fullscreen.COCALC_MINIMAL) {
  notifications_init(redux);
}

import { init as markdown_init } from "./widget-markdown-input/main";
markdown_init();

// only enable iframe comms in minimal kiosk mode
import { init as iframe_comm_init } from "./iframe-communication";
if (fullscreen.COCALC_MINIMAL) {
  iframe_comm_init();
}

import { render } from "./app/render";
render();

$(window).on("beforeunload", redux.getActions("page").check_unload);

// Should be loaded last
import "./last";

// adding a banner in case react crashes (it will be revealed)
const crash = require("./crash.html");
import { HELP_EMAIL } from "smc-util/theme";
$("body").append(crash.replace(/HELP_EMAIL/g, HELP_EMAIL));
