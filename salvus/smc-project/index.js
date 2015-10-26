require('coffee-script/register') /* so we can require coffeescript */
require('coffee-cache')  /* so coffeescript doesn't get recompiled every time we require it */

exports.local_hub      = require('./local_hub.coffee')
exports.console_server = require('./console_server.coffee')
