###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jquery-support')

exports.react = (res, component) ->
    res.send(ReactDOMServer.renderToStaticMarkup(component))


