console.log("getting db")
require('../../smc-hub/rethink').rethinkdb
    hosts:['localhost']
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
                    else
                        console.log("DONE")

