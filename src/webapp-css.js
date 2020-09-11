/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// definition of the common css for webpack

// note, there is also webapp-lib/_inc_head.pug, which loads CSS from the /res/
// endpoint, which is used across all pages. most importantly, this loads bootstrap 3.x

import "jquery/jquery-ui/css/humanity/jquery-ui.css";

// Font Awesome
// This would be the new CSS version.
//require("@fortawesome/fontawesome-free/css/all.css")
// Instead we use the evidently way better (?) js/svg new approach:
import "@fortawesome/fontawesome-free/js/all.js";

import "@fortawesome/fontawesome-free/js/brands.js";

// Shim is needed until we manually/automatically rename ALL icons as
// explained here: https://fontawesome.com/how-to-use/upgrading-from-4#upgrade-steps
import "@fortawesome/fontawesome-free/js/v4-shims.js";

import "jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css";

// Dropzone in file/new
import "dropzone/css/dropzone.css";

// Datetime picker plugin
import "datetimepicker/bootstrap-datetimepicker.min.css";

// Needed by DateTimePicker - http://jquense.github.io/react-widgets/docs/#/i18n
import 'react-widgets/lib/less/react-widgets.less';

// custom cocalc icon font
import 'webapp-lib/cocalc-icons-font/style.css';

// info at the bottom about the next step in startup sequence
if (window.smcLoadStatus != null) {
    window.smcLoadStatus("Loading CoCalc...");
}
