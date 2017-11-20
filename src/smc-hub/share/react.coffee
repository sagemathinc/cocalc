###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

{mathjax} = require('./mathjax-support')

exports.react = (res, component) ->
    html = ReactDOMServer.renderToStaticMarkup(component)
    mathjax html, (err, html) ->
        res.send('<!DOCTYPE html>' + html)


