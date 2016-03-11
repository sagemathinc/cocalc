# definition of the smc-client for webpack
# used via webpack.config.coffee to add entries to index.ejs for index.html

require("./static/jquery/jquery-ui/css/humanity/jquery-ui.css")
require("./static/bootstrap-3.3.0/css/bootstrap.min.css")
require("./static/font-awesome/css/font-awesome.min.css")
require("./static/bootstrap-switch/bootstrap-switch.css")
require("./static/jquery/plugins/bootstrap-colorpicker/css/bootstrap-colorpicker.css")
require("./static/pnotify/jquery.pnotify.default.css")
require("./static/pnotify/jquery.pnotify.default.icons.css")
require("./static/dropzone/css/dropzone.css")
# Datetime picker plugin
require("./static/datetimepicker/bootstrap-datetimepicker.min.css")

# Needed by DateTimePicker - http://jquense.github.io/react-widgets/docs/#/i18n
require('react-widgets/lib/less/react-widgets.less')

# SASS Style file for SMC
require('./smc-webapp/index.sass')

require('./smc-webapp/client_browser.coffee')
require('./smc-webapp/landing')

exports.smc_icon_path = smc_icon_path = require('./static/salvus-icon.svg')
console.log("smc_icon", smc_icon_path)

