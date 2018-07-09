###
This is basically silly one-off code, meant entirely for use in development.
###

require('node-cjsx').transform()
require('./jsdom-support.coffee')
{HTML}  = require('smc-webapp/r_misc')
{React} = require('smc-webapp/app-framework')

exports.HTML = HTML
exports.c      = -> React.createElement('div', null, React.createElement(HTML, {value:'$x^3$'}))
exports.render = require('react-dom/server').renderToStaticMarkup

