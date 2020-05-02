#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

memwatch = require('node-memwatch')

exports.init = (log) ->
    memwatch.on 'leak', (info) ->
        log("MEMWATCH_LEAK='#{JSON.stringify(info)}'")
    memwatch.on 'stats', (stats) ->
        log("MEMWATCH_STATS='#{JSON.stringify(stats)}'")
