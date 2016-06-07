# definition of the common css for webpack
# used via webpack.config.coffee to add entries to index.html

require("jquery/jquery-ui/css/humanity/jquery-ui.css")
require("bootstrap-3.3.0/css/bootstrap.min.css")
require("font-awesome/css/font-awesome.min.css")
require("bootstrap-switch/bootstrap-switch.css")
require("jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css")
require("pnotify/jquery.pnotify.default.css")
require("pnotify/jquery.pnotify.default.icons.css")

# Dropzone in file/new
require("dropzone/css/dropzone.css")

# Datetime picker plugin
require("datetimepicker/bootstrap-datetimepicker.min.css")

# Needed by DateTimePicker - http://jquense.github.io/react-widgets/docs/#/i18n
require('react-widgets/lib/less/react-widgets.less')

# Needed by Octicon for displaying GitHub fonticons (see r_misc.cjsx)
require('octicons/octicons/octicons.css')

# info at the bottom about the next step in startup sequence
if window.smcLoadStatus?
    window.smcLoadStatus("Loading JavaScript libraries ...")
