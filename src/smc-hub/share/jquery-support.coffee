###
Horrible crutch -- support jQuery for now...
###

{JSDOM} = require('jsdom')
DOM = new JSDOM('<!DOCTYPE html>')
jQuery = require('jquery')(DOM.window)

console.log("jQuery.fn = ", jQuery.fn)

global['BACKEND']  = true
global['window']   = DOM.window
global['document'] = DOM.window.document
global['DEBUG']    = false

global['$'] = global['jQuery'] = DOM.window.$ = jQuery

