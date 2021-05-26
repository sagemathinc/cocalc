/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// definition of the common css for webpack

import "katex/dist/katex.min.css";

// note, there is also webapp-lib/_inc_head.pug, which loads CSS from the /res/
// endpoint, which is used across all pages. most importantly, this loads bootstrap 3.x

import "jquery/jquery-ui/css/humanity/jquery-ui.css";

// Font Awesome
import "@fortawesome/fontawesome-free/js/all.js";
import "@fortawesome/fontawesome-free/js/brands.js";
import "@fortawesome/fontawesome-free/css/all.min.css";

// Shim is needed until we manually/automatically rename ALL icons as
// explained here: https://fontawesome.com/how-to-use/upgrading-from-4#upgrade-steps
import "@fortawesome/fontawesome-free/js/v4-shims.js";

import "jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css";

// Dropzone CSS style
import "smc-webapp/node_modules/dropzone/dist/min/dropzone.min.css";

// custom cocalc icon font
import 'webapp-lib/cocalc-icons-font/style.css';

// info at the bottom about the next step in startup sequence
if (window.smcLoadStatus != null) {
    window.smcLoadStatus("Loading ...");
}
