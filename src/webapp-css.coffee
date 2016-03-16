# definition of the common css for webpack
# used via webpack.config.coffee to add entries to index.html

require("jquery/jquery-ui/css/humanity/jquery-ui.css")
require("bootstrap-3.3.0/css/bootstrap.min.css")
require("font-awesome/css/font-awesome.min.css")
require("bootstrap-switch/bootstrap-switch.css")
require("jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css")
require("pnotify/jquery.pnotify.default.css")
require("pnotify/jquery.pnotify.default.icons.css")
require("dropzone/css/dropzone.css")
# Datetime picker plugin
require("datetimepicker/bootstrap-datetimepicker.min.css")

# Needed by DateTimePicker - http://jquense.github.io/react-widgets/docs/#/i18n
require('react-widgets/lib/less/react-widgets.less')

# info for next step in startup sequence
window.smcLoadStatus("Loading JavaScript libraries ...")