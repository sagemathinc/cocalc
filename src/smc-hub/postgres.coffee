#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
PostgreSQL database entry point.
Do not import any of the submodules directly unless you
know exactly what you're doing.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###
require('coffee2-cache')

fs           = require('fs')

base = require('./postgres-base')
for f in ['pg_type', 'expire_time', 'one_result', 'all_results', 'count_result']
    exports[f] = base[f]

exports.PUBLIC_PROJECT_COLUMNS = base.PUBLIC_PROJECT_COLUMNS
exports.PROJECT_COLUMNS        = base.PROJECT_COLUMNS

# Add further functionality to PostgreSQL class -- must be at the bottom of this file.
# Each of the following calls composes the PostgreSQL class with further important functionality.
# Order matters.
PostgreSQL = base.PostgreSQL
for module in ['server-queries', 'blobs', 'synctable', 'user-queries', 'ops']
     PostgreSQL = require("./postgres-#{module}").extend_PostgreSQL(PostgreSQL)

exports.db = (opts) ->
    return new PostgreSQL(opts)


