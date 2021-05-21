/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Library file for SMC webapp

// node.js polyfill -- needed for some modules to load in the browser.
window.Buffer = require("buffer").Buffer;

import "script-loader!primus/primus-engine.min.js";

// this must come before anything that touches event handling, etc.
import "webapp-lib/webapp-error-reporter.coffee";

// require("script!jquery/jquery.min.js")
const jQuery = (window.$ = window.jQuery = require("jquery"));
const $ = jQuery;
// explicit jQuery UI widgets that we use -- no need to load the entire library
require("../node_modules/smc-webapp/node_modules/jquery-ui/ui/widgets/draggable"); // TODO: do we use?
require("../node_modules/smc-webapp/node_modules/jquery-ui/ui/widgets/sortable"); // TODO: do we use?
require("../node_modules/smc-webapp/node_modules/jquery-ui/ui/widgets/slider");
require("../node_modules/smc-webapp/node_modules/jquery-ui/ui/widgets/resizable"); // TODO: do we use?

// $.tooltip() setup
require("../node_modules/smc-webapp/node_modules/jquery-focusable/jquery.focusable.js"); // jquery-focusable is a peer dependency.
require("../node_modules/smc-webapp/node_modules/jquery-focus-exit/jquery.focusexit.js"); // jquery-focus-exit is a peer dependency.
require("../node_modules/smc-webapp/node_modules/jquery-mouse-exit/jquery.mouseexit.js"); // jquery-mouse-exit is a peer dependency.
require("../node_modules/smc-webapp/node_modules/jquery-stick/jquery.stick.js"); // jquery-stick is a peer dependency.
require("../node_modules/smc-webapp/node_modules/jquery-tooltip/jquery.tooltip.js");

// Hack to make jQuery UI work on mobile devices: http://touchpunch.furf.com/
require("../node_modules/smc-webapp/node_modules/jquery-ui-touch-punch");

// Hack to make jQuery hide and show not break with Bootstrap 3
require("webapp-lib/jquery/plugins/bootstrap_hide_show.js");

// Timeago jQuery plugin
require("timeago");

// Scroll into view plugin
require("jquery.scrollintoview/jquery.scrollintoview.js");

//  Highlight jQuery plugin: http://bartaz.github.io/sandbox.js/jquery.highlight.html
require("jquery-highlight");

// Caret Position jQuery plugin
require("jquery-caret");

// Bootstrap
require("bootstrap");

// Bootbox: usable dialogs for bootstrap
require("script-loader!../node_modules/smc-webapp/node_modules/bootbox/bootbox.min.js"); // loads from smc-webapp/node_modules

// Bootstrap Colorpicker Plugin
require("../node_modules/smc-webapp/node_modules/bootstrap-colorpicker");

// XTerm terminal emulator
require("script-loader!webapp-lib/term/term.js");
require("script-loader!webapp-lib/term/color_themes.js");

// after this lib.js package, the real smc.js app starts loading
if (window.smcLoadStatus != null) {
  window.smcLoadStatus("Starting main application ...");
}

require("../node_modules/smc-webapp/node_modules/antd/dist/antd.css");

// SASS style file for CoCalc
require("../node_modules/smc-webapp/index.sass");

require("../node_modules/smc-webapp/webapp-client");
require("../node_modules/smc-webapp/set-version-cookie.js");
require("../node_modules/smc-webapp/entry-point");
