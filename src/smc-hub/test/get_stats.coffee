# little helper for developing get_stats against the current dev database

postgres = require('../postgres')
misc = require('../../smc-util/misc')

db_name = process.env['SMC_DB'] ? 'smc'
db = postgres.db(database:db_name, debug:true, connect:false)

db.connect cb: ->
    db.get_stats
        cb: (err, x) ->
            console.log JSON.stringify(x, null, 2)
            process.exit 0
