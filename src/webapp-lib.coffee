# Library file for SMC webapp

# These old-school JS files need to be on top, otherwise dependency issues arise
# (e.g. minified jquery isn't properly being detected, etc.)

# this loads the "traditional" js files via webpack.config.coffee
# it doesn't minify them – but webpack in production mode optimizes everything as a whole
# and evals them right into the global context
# TODO switch to npm packaging

require("script!primus/primus-engine.min.js")

# polyfill Number.isNaN for IE
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN#Polyfill
Number.isNaN = Number.isNaN || (value) ->
    typeof value == "number" and isNaN(value)

# polyfill for internet explorer's lack of String.prototype.startswith
String::startsWith ?= (searchString, position) ->
    pos = position ? 0
    @indexOf(searchString, pos) == pos

# polyfill for internet explorer's lack of String.prototype.includes
# https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes#Polyfill
String::includes ?= (search, start) ->
    if typeof start != 'number'
        start = 0
    if start + search.length > @length
        return false
    else
        return @indexOf(search, start) != -1

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
require("imports?jQuery=jquery!jquery-tooltip/jquery.tooltip.js")

# Hack to make jQuery UI work on mobile devices: http://touchpunch.furf.com/
# require("script!jquery/plugins/jquery.ui.touch-punch.min.js")
require('jquery-ui-touch-punch')

# Hack to make jQuery hide and show not break with Bootstrap 3
require("./webapp-lib/jquery/plugins/bootstrap_hide_show.js")

# Timeago jQuery plugin
# require("script!jquery/plugins/jquery.timeago.min.js")
require('timeago')

# Scroll into view plugin
# require("script!jquery/plugins/jquery.scrollintoview.min.js")
require("jquery-scrollintoview/jquery.scrollintoview.js")

#  Highlight jQuery plugin: http://bartaz.github.io/sandbox.js/jquery.highlight.html
# require("script!jquery/plugins/jquery.highlight.min.js")
require('jquery-highlight')

# Caret Position jQuery plugin
#require("script!jquery/plugins/caret/jquery.caret.js")
require('jquery-caret')

# Bootstrap
# require("script!bootstrap-3.3.0/js/bootstrap.min.js")
require('bootstrap')

# Bootbox: usable dialogs for bootstrap
# the next 4 lines and the reversal below is a hack around defining "define" and "require" from requirejs
window.__define = window.define
window.__require = window.require
window.define = undefined
window.require = undefined
require("script!bootbox/bootbox.min.js")  # loads from smc-webapp/node_modules
# require('bootbox') # this doesn't work, sadly (jquery initializiation with "modal" from bootstrap doesn't happen properly)
window.define = window.__define
window.require = window.__require
window.__define = undefined
window.__require = undefined

# Bootstrap switch: https://github.com/nostalgiaz/bootstrap-switch
#require("script!bootstrap-switch/bootstrap-switch.min.js")
require('bootstrap-switch')

# Bootstrap Colorpicker Plugin
# require("script!jquery/plugins/bootstrap-colorpicker/js/bootstrap-colorpicker.js")
require('bootstrap-colorpicker')

# Pnotify: Notification framework from http://pinesframework.org/pnotify
require("script!pnotify/jquery.pnotify.min.js")
#PNotify = require("pnotify/src/pnotify.js");
require("pnotify/src/pnotify.mobile.js");
require("pnotify/src/pnotify.buttons.js");
require("pnotify/src/pnotify.desktop.js");

# Datetime picker
require("script!datetimepicker/bootstrap-datetimepicker.min.js")
# https://github.com/eonasdan/bootstrap-datetimepicker
# require("eonasdan-bootstrap-datetimepicker")

# XTerm terminal emulator
require("script!term/term.js")
require("script!term/color_themes.js")

# Make html look nice
require("script!jsbeautify/beautify-html.min.js")

# Make html into markdown
#require("script!remarked/reMarked.min.js")

# ********************************
# node_modules, mainly from inside smc-webapp

require("async")
require("events")
require("marked")
require("redux")
require("react")
require("react-redux")
require("react-timeago")
require("react-bootstrap")
require("sha1")
require("three")
require("underscore")
require("immutable")
require("react-dropzone-component")
require("jquery.payment")
require("react-widgets/lib/Combobox")
require("react-widgets/lib/DateTimePicker")
require("md5")
require("./smc-webapp/codemirror/codemirror.coffee")

# after this lib.js package, the real smc.js app starts loading
window.smcLoadStatus("Starting main application ...")
