// this must come before anything that touches event handling, etc.
import "./webapp-error-reporter.coffee";

// Bootstrap must go early, since a lot of our CSS overrides it.
// TODO: get rid of bootstrap!  We intend to switch to antd entirely!
import "bootstrap/dist/css/bootstrap.min.css";

import "antd/dist/antd.css";

// explicit jQuery UI widgets that we use -- no need to load the entire library
import "jquery-ui/ui/widgets/draggable"; // used in sage worksheets
import "jquery-ui/ui/widgets/slider"; // used in sage worksheets
import "jquery-ui/ui/widgets/resizable"; // used in sage worksheets
// this is a require since it must happen after window.jQuery above (and imports happen before code).
import "jquery-tooltip/jquery.tooltip"; // used in sage worksheets
// Hack to make jQuery UI work on mobile devices: http://touchpunch.furf.com/
import "jquery-ui-touch-punch";

// Hack we wrote to make jQuery hide and show not break with Bootstrap 3
import "@cocalc/assets/jquery/plugins/bootstrap_hide_show";

// Timeago jQuery plugin
import "timeago";

// Scroll into view plugin
import "jquery.scrollintoview/jquery.scrollintoview";

// Bootstrap
import "bootstrap";

// Bootbox: usable dialogs for bootstrap
import "script-loader!bootbox/bootbox.min"; // loads from @cocalc/frontend/node_modules

// Bootstrap Colorpicker Plugin
import "bootstrap-colorpicker";

// XTerm terminal emulator
import "script-loader!@cocalc/assets/term/term.js";
import "script-loader!@cocalc/assets/term/color_themes.js";

import "@cocalc/frontend/set-version-cookie.js";

import "./webapp-css";

// SASS style file for CoCalc.  This must be at
// the very end, and by using a dynamic import, it
// is imported in another chunk, hence after antd.
// That's important so this overrides antd.
import("@cocalc/frontend/index.sass"); // this is a dynamic import on purpose!