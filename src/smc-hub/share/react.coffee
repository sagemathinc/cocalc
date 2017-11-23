###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

{mathjax} = require('./mathjax-support')

# Uncomment for benchmarking purposes.  This is already set when running in kubernetes.
## process.NODE_ENV="production"

exports.react = (res, component) ->
    html = '<!DOCTYPE html>' + ReactDOMServer.renderToStaticMarkup(component)
    if html.indexOf('cocalc-share-mathjax') != -1
        mathjax html, (err, html) ->
            res.send(html)
    else
        res.send(html)


