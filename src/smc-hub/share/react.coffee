###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

exports.react = (res, component) ->
    res.send(ReactDOMServer.renderToStaticMarkup(component))


