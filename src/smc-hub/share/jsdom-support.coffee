###
We use JSDom for some rendering...
###

{JSDOM} = require('jsdom')
DOM = new JSDOM('<!DOCTYPE html>')
jQuery = require('jquery')(DOM.window)

global.BACKEND   = true
global.DOM       = DOM
global.window    = DOM.window
global.document  = DOM.window.document
global.navigator = DOM.window.navigator = {userAgent:''}

global.DEBUG     = false
global.$         = global.jQuery = DOM.window.$ = jQuery

# ensure the global variable window.CodeMirror is defined.
global.CodeMirror = DOM.window.CodeMirror = require('codemirror')
require('codemirror/addon/runmode/runmode')
require('smc-webapp/codemirror/mode/python')
require('codemirror/mode/stex/stex')
require('smc-webapp/codemirror/custom-modes')
# TODO: add a lot more, but by refactoring the relevant code in smc-webapp and requiring it here...



