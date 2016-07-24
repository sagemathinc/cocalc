fs = require('fs')

rethinkdb = require('rethinkdb')
async     = require('async')

f = ->
    console.log 'hi!'

main = () ->
    setInterval(f, 2000)

    conn = undefined
    async.series([
        (cb) ->
            authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
            rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
                conn = _conn
                cb(err)
        (cb) ->
            # TODO: query, do stuff...
            cb()

    ], (err) ->
        console.log("DONE", err)
    )

main()