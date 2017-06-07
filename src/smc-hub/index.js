require('coffee-script/register') /* so we can require coffeescript */
require('coffee-cache')  /* so coffeescript doesn't get recompiled every time we require it */

exports['compute-client'] = require('./compute-client.coffee')
exports['compute-server'] = require('./compute-server.coffee')
exports.hub        = require('./hub.coffee')
exports.postgres   = require('./postgres.coffee')
exports.smc_gcloud = require('./smc_gcloud.coffee')
exports.storage    = require('./storage.coffee')
