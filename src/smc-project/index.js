require('coffeescript/register') /* so we can require coffeescript */
require('coffee-cache')  /* so coffeescript doesn't get recompiled every time we require it */

if not process.env.SMC?
    process.env.SMC = path.join(process.env.HOME, '.smc')

exports.local_hub      = require('./local_hub.coffee')
exports.console_server = require('./console_server.coffee')
