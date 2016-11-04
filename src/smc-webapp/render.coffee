# Enable transparent server-side requiring of cjsx files.
require('node-cjsx').transform()

# The overall procedure is the following:
# 1. render the component (rendering step is defined in the billing.cjsx file) into the webapp-lib folder
# 2. during the "webpack" step, this component is included into a full html page via includes
# look into policies/pricing.html, there is <%= require('html?conservativeCollapse!./_static_pricing_page.html') %>

# there is a global window object, which is undefined in node.js' world -- we mock it and hope for the best.
global['window'] = {}
# webpack's injected DEBUG flag, we set it to false
global['DEBUG']  = false

# Code for static server-side rendering of the subscription options.
# note, that we use renderToStaticMarkup, not renderToString
# (see https://facebook.github.io/react/docs/top-level-api.html#reactdomserver.rendertostaticmarkup)
exports.render_subscriptions = ->
    ReactDOMServer = require('react-dom/server')
    billing = require('./billing.cjsx')
    fs = require('fs')
    html = ReactDOMServer.renderToStaticMarkup(billing.render_static_pricing_page())
    filename = '../webapp-lib/policies/_static_pricing_page.html'
    fs.writeFileSync(filename, html)
