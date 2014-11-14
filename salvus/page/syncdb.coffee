###
(c) William Stein, 2014

Synchronized document-oriented database -- browser client.

###


syncdoc  = require('syncdoc')
diffsync = require('diffsync')
misc     = require('misc')

{defaults, required} = misc

to_json = (s) ->
    try
        return misc.to_json(s)
    catch e
        console.log("UNABLE to convert this object to json", s)
        throw e

exports.synchronized_db = (opts) ->
    opts = defaults opts,
        project_id : required
        filename   : required
        cb         : required

    syncdoc.synchronized_string
        project_id : opts.project_id
        filename   : opts.filename    # should end with .smcdb
        cb         : (err, doc) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, new diffsync.SynchronizedDB(doc, to_json))

