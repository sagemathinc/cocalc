require('coffee-script/register') /* so we can require coffeescript */
require('coffee-cache')  /* so coffeescript doesn't get recompiled every time we require it */

exports.misc       = require('./misc.coffee')
exports.message    = require('./message.coffee')
exports.client     = require('./client.coffee')
exports.syncstring = require('./syncstring.coffee')
exports.synctable  = require('./synctable.coffee')
exports.upgrades   = require('./upgrades.coffee')
exports.schema     = require('./schema.coffee')