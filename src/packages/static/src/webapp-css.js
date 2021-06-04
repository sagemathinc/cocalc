/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// definition of the common css for webpack
import "jquery/jquery-ui/css/humanity/jquery-ui.css";
import "jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css";
import "./dropzone.css";

// info at the bottom about the next step in startup sequence
if (window.smcLoadStatus != null) {
  window.smcLoadStatus("Loading ...");
}
