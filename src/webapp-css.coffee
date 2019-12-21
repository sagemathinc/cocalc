# definition of the common css for webpack
# used via webpack.config.coffee to add entries to index.html

require("jquery/jquery-ui/css/humanity/jquery-ui.css")
require("bootstrap-3.3.0/css/bootstrap.min.css")

# Font Awesome
# This would be the new CSS version.
#require("@fortawesome/fontawesome-free/css/all.css")
# Instead we use the evidently way better (?) js/svg new approach:
require("@fortawesome/fontawesome-free/js/all.js")
require("@fortawesome/fontawesome-free/js/brands.js")
# Shim is needed until we manually/automatically rename ALL icons as
# explained here: https://fontawesome.com/how-to-use/upgrading-from-4#upgrade-steps
require("@fortawesome/fontawesome-free/js/v4-shims.js")

require("jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css")

# Dropzone in file/new
require("dropzone/css/dropzone.css")

# Datetime picker plugin
require("datetimepicker/bootstrap-datetimepicker.min.css")

# Needed by DateTimePicker - http://jquense.github.io/react-widgets/docs/#/i18n
require('react-widgets/lib/less/react-widgets.less')

# Needed by Octicon for displaying GitHub fonticons (see r_misc.cjsx)
require('octicons/octicons/octicons.css')

# custom cocalc icon font
require('webapp-lib/cocalc-icons-font/style.css')

# info at the bottom about the next step in startup sequence
if window.smcLoadStatus?
    window.smcLoadStatus("Loading CoCalc...")
