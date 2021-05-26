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
import "@fortawesome/fontawesome-free/js/all.min.js";
import "@fortawesome/fontawesome-free/js/brands.min.js";
// little shim needed until we rename our icons...
import "@fortawesome/fontawesome-free/js/v4-shims.min.js";

import "jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css";

// custom cocalc icon font
import "webapp-lib/cocalc-icons-font/style.css";

import "./dropzone.css";

// info at the bottom about the next step in startup sequence
if (window.smcLoadStatus != null) {
  window.smcLoadStatus("Loading ...");
}
