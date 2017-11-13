###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

# So some of our frontend code can be more lax.s
global['BACKEND'] = true
global['window']  = {}
global['DEBUG']   = false
global['$']       = global['window'].$ = $ = ->
$.get             = ->

exports.react = (res, component) ->
    res.send(ReactDOMServer.renderToStaticMarkup(component))

