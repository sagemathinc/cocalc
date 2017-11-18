###
Load react support for rendering.
###

# Code for rendering react components to html.
ReactDOMServer = require('react-dom/server')

require('./jsdom-support')

# why string addition? see this closed (wontfix) ticket https://github.com/facebook/react/issues/1035#issuecomment-112500182
exports.react = (res, component) ->
    res.send('<!DOCTYPE html>' + ReactDOMServer.renderToStaticMarkup(component))


