###
PostgreSQL database entry point.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###
require('coffee-cache')

fs           = require('fs')

base = require('./postgres-base')
for f in ['pg_type', 'expire_time', 'one_result', 'all_results', 'count_result']
    exports[f] = base[f]

# Add further functionality to PostgreSQL class -- must be at the bottom of this file.
# Each of the following calls extends the PostgreSQL class with further important functionality.
# Order matters.
for module in ['base', 'server-queries', 'blobs', 'synctable', 'user-queries', 'ops']
    exports.PostgreSQL = require("./postgres-#{module}").PostgreSQL

exports.db = (opts) ->
    return new exports.PostgreSQL(opts)


