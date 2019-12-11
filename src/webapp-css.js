// definition of the common css for webpack
import "jquery/jquery-ui/css/humanity/jquery-ui.css";

import "bootstrap-3.3.0/css/bootstrap.min.css";

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

// Needed by Octicon for displaying GitHub fonticons (see r_misc.cjsx)
import 'octicons/octicons/octicons.css';

// custom cocalc icon font
import 'webapp-lib/cocalc-icons-font/style.css';

// info at the bottom about the next step in startup sequence
if (window.smcLoadStatus != null) {
    window.smcLoadStatus("Loading CoCalc...");
}
