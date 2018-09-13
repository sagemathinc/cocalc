memwatch = require('memwatch-next')

exports.init = (log) ->
    memwatch.on 'leak', (info) ->
        log("MEMWATCH_LEAK='#{JSON.stringify(info)}'")
    memwatch.on 'stats', (stats) ->
        log("MEMWATCH_STATS='#{JSON.stringify(stats)}'")
