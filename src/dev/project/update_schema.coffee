#!/usr/bin/env coffee

fs = require('fs')

try
    port = fs.readFileSync('ports/rethinkdb').toString()
catch
    port = 28015

console.log("connecting to database at localhost:#{port}  -- make sure rethinkdb is running")
require('../../smc-hub/rethink').rethinkdb
    hosts:["localhost:#{port}"]
    pool:1
    cb   : (err, db) ->
        if err
            console.log('failed')
        else
            console.log('configuring....')
            db.update_schema
                cb:(err) ->
                    if err
                        console.log("FAILED! -- ", err)
                        process.exit(1)
                    else
                        console.log("DONE")
                        process.exit(0)
