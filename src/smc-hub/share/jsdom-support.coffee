###
We use JSDom for some rendering...
###

console.log("loading jsdom...")
{JSDOM} = require('jsdom')

console.log("loading jQuery...")
DOM = new JSDOM('<!DOCTYPE html>', {url: 'http://localhost'})
jQuery = require('jquery')(DOM.window)

global.BACKEND   = true
global.DOM       = DOM
global.window    = DOM.window
global.document  = DOM.window.document
global.navigator = DOM.window.navigator = {userAgent:''}

global.DEBUG     = false
global.$         = global.jQuery = DOM.window.$ = jQuery

console.log("ensure the global variable window.CodeMirror is defined....")
global.CodeMirror = DOM.window.CodeMirror = require('codemirror')
require('codemirror/addon/runmode/runmode')
require('smc-webapp/codemirror/modes')
require('smc-webapp/codemirror/custom-modes')
# TODO: add a lot more, but by refactoring the relevant code in smc-webapp and requiring it here...

console.log("jsdom support loaded")

