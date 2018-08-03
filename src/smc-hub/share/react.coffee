###
Load react support for rendering.
###

async = require('async')

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

# Uncomment for cc-in-cc dev benchmarking purposes.  This variable is already set
# by the Docker container when running in kubernetes.
## process.NODE_ENV="production"

require('smc-webapp/r_misc').SHARE_SERVER = true

# Load katex jQuery plugin.
require('smc-webapp/jquery-plugins/katex')

exports.react = (res, component, extra, viewer) ->
    res.type('html')
    t0 = new Date()
    stream = ReactDOMServer.renderToStaticNodeStream(component)
    stream.pipe(res)
    stream.once 'end', ->
        console.log("react: time to render and stream out: #{new Date() - t0}ms", extra)
