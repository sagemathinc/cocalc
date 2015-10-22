require('coffee-script/register') /* so we can require coffeescript */
require('coffee-cache')  /* so coffeescript doesn't get recompiled every time we require it */

exports.compute    = require('./compute.coffee')
exports.hub        = require('./hub.coffee')
exports.rethink    = require('./rethink.coffee')
exports.smc_gcloud = require('./smc_gcloud.coffee')
