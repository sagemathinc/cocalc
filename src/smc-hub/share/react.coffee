###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

{mathjax} = require('./mathjax-support')

# Uncomment for cc-in-cc dev benchmarking purposes.  This variable is already set
# by the Docker container when running in kubernetes.
## process.NODE_ENV="production"


STREAMING = false
# Ned to implement more targetted mathjax before enabling streaming

if STREAMING
    # We use streaming rendering -- see https://hackernoon.com/whats-new-with-server-side-rendering-in-react-16-9b0d78585d67
    exports.react = (res, component, extra) ->
        t0 = new Date()
        res.type('html')
        stream = ReactDOMServer.renderToStaticNodeStream(component)
        stream.once 'end', ->
            console.log("react: time to render and send: #{new Date() - t0}ms", extra)
        stream.pipe(res)

else

    exports.react = (res, component, extra) ->
        t0 = new Date()
        html = '<!DOCTYPE html>' + ReactDOMServer.renderToStaticMarkup(component)
        if html.indexOf('cocalc-share-mathjax') != -1
            mathjax html, (err, html) ->
                console.log("react: time to render and send: #{new Date() - t0}ms", extra)
                res.send(html)
        else
            res.send(html)
