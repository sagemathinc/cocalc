# Library file for SMC webapp

require("script-loader!primus/primus-engine.min.js")

# this must come before anything that touches event handling, etc.
require('webapp-lib/webapp-error-reporter.coffee')

# require("script!jquery/jquery.min.js")
$ = jQuery = window.$ = window.jQuery = require('jquery')
#require('jquery-ui')
# explicit jQuery UI widgets that we use -- no need to load the entire library
require("node_modules/jquery-ui/ui/widgets/draggable") # TODO: do we use?
require("node_modules/jquery-ui/ui/widgets/sortable")  # TODO: do we use?
require("node_modules/jquery-ui/ui/widgets/slider")
require("node_modules/jquery-ui/ui/widgets/resizable") # TODO: do we use?

# $.tooltip() setup
require("jquery-focusable/jquery.focusable.js")  # jquery-focusable is a peer dependency.
require("jquery-focus-exit/jquery.focusexit.js")  # jquery-focus-exit is a peer dependency.
require("jquery-mouse-exit/jquery.mouseexit.js")  # jquery-mouse-exit is a peer dependency.
require("jquery-stick/jquery.stick.js")  # jquery-stick is a peer dependency.
require("imports-loader?jQuery=jquery!jquery-tooltip/jquery.tooltip.js")

# Hack to make jQuery UI work on mobile devices: http://touchpunch.furf.com/
# require("script!jquery/plugins/jquery.ui.touch-punch.min.js")
require('jquery-ui-touch-punch')

# Hack to make jQuery hide and show not break with Bootstrap 3
require("./webapp-lib/jquery/plugins/bootstrap_hide_show.js")

# Timeago jQuery plugin
require('timeago')

# Scroll into view plugin
require("jquery.scrollintoview/jquery.scrollintoview.js")

#  Highlight jQuery plugin: http://bartaz.github.io/sandbox.js/jquery.highlight.html
require('jquery-highlight')

# Caret Position jQuery plugin
require('jquery-caret')

# Stripe Payment jQuery plugin
require("jquery.payment")

# Bootstrap
require('bootstrap')

# Bootbox: usable dialogs for bootstrap
require("script-loader!bootbox/bootbox.min.js")  # loads from smc-webapp/node_modules
# require('bootbox') # this doesn't work, sadly (jquery initializiation with "modal" from bootstrap doesn't happen properly)

# Bootstrap Colorpicker Plugin
require('bootstrap-colorpicker')

# Pnotify: Notification framework from http://pinesframework.org/pnotify
require("script-loader!pnotify/jquery.pnotify.min.js")
#PNotify = require("pnotify/src/pnotify.js");
require("pnotify/src/pnotify.mobile.js");
require("pnotify/src/pnotify.buttons.js");
require("pnotify/src/pnotify.desktop.js");

# Datetime picker
require("script-loader!datetimepicker/bootstrap-datetimepicker.min.js")
# https://github.com/eonasdan/bootstrap-datetimepicker
# require("eonasdan-bootstrap-datetimepicker")

# XTerm terminal emulator
require("script-loader!term/term.js")
require("script-loader!term/color_themes.js")

# Make html look nice
require("script-loader!jsbeautify/beautify-html.min.js")


# after this lib.js package, the real smc.js app starts loading
window.smcLoadStatus("Starting main application ...")

# SASS Style file for SMC
require('./smc-webapp/index.sass')

require('./smc-webapp/client_browser.coffee')

require('./smc-webapp/entry-point')
