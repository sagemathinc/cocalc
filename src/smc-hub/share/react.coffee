###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

{mathjax} = require('./mathjax-support')

exports.react = (res, component) ->
    html = '<!DOCTYPE html>' + ReactDOMServer.renderToStaticMarkup(component)
    if html.indexOf('cocalc-share-mathjax') != -1
        mathjax html, (err, html) ->
            res.send(html)
    else
        res.send(html)


